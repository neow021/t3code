import {
  type EnvironmentId,
  type VcsListRefsResult,
  type VcsListWorktreesResult,
  type VcsWorktreeInventoryEntry,
  WS_METHODS,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PartitionedSemaphore from "effect/PartitionedSemaphore";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import * as ConnectionWakeups from "../connection/wakeups.ts";
import { safeErrorLogAttributes } from "../errors/safeLog.ts";
import { EnvironmentCacheStore } from "../platform/persistence.ts";
import { request } from "../rpc/client.ts";
import { followStreamInEnvironment } from "./runtime.ts";

const WORKTREE_INVENTORY_IDLE_TTL_MS = 30_000;
const FALLBACK_PAGE_LIMIT = 200;

export type WorktreeInventoryCompleteness = "complete" | "partial" | "unavailable";
export type WorktreeInventoryMode = "authoritative" | "refs-fallback";

export interface WorktreeInventoryView {
  readonly environmentId: EnvironmentId;
  readonly requestedCwd: string;
  readonly data: VcsListWorktreesResult | null;
  readonly completeness: WorktreeInventoryCompleteness;
  readonly mode: WorktreeInventoryMode;
  readonly connected: boolean;
  readonly stale: boolean;
  readonly mutationsEnabled: boolean;
}

export interface WorktreeInventoryInput {
  readonly cwd: string;
  readonly supportsCompleteInventory: boolean;
}

interface WorktreeInventoryCacheState {
  readonly revision: number;
}

const cacheStateByEnvironment = Atom.family((environmentId: EnvironmentId) =>
  Atom.make<WorktreeInventoryCacheState>({ revision: 0 }).pipe(
    Atom.keepAlive,
    Atom.withLabel(`environment-data:vcs:worktree-inventory-state:${environmentId}`),
  ),
);
const persistenceLock = PartitionedSemaphore.makeUnsafe<EnvironmentId>({ permits: 1 });

export function worktreeInventoryCacheStateAtom(environmentId: EnvironmentId) {
  return cacheStateByEnvironment(environmentId);
}

function normalizedPortablePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function containsPath(root: string, candidate: string): boolean {
  const normalizedRoot = normalizedPortablePath(root);
  const normalizedCandidate = normalizedPortablePath(candidate);
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

export function findCachedWorktreeInventory(
  cwd: string,
  inventories: ReadonlyArray<VcsListWorktreesResult>,
): Option.Option<VcsListWorktreesResult> {
  const candidates = inventories.flatMap((inventory) =>
    inventory.worktrees
      .filter((worktree) => containsPath(worktree.path, cwd))
      .map((worktree) => ({ inventory, pathLength: normalizedPortablePath(worktree.path).length })),
  );
  candidates.sort((left, right) => right.pathLength - left.pathLength);
  return Option.fromUndefinedOr(candidates[0]?.inventory);
}

function cachedData(data: VcsListWorktreesResult): VcsListWorktreesResult {
  return {
    ...data,
    freshness: {
      ...data.freshness,
      source: "cached-local",
    },
  };
}

function view(input: {
  readonly environmentId: EnvironmentId;
  readonly requestedCwd: string;
  readonly data: VcsListWorktreesResult | null;
  readonly completeness: WorktreeInventoryCompleteness;
  readonly mode: WorktreeInventoryMode;
  readonly connected: boolean;
  readonly stale: boolean;
}): WorktreeInventoryView {
  return {
    ...input,
    mutationsEnabled:
      input.connected &&
      !input.stale &&
      input.completeness === "complete" &&
      input.mode === "authoritative",
  };
}

const listAllFallbackRefs = Effect.fn("WorktreeInventory.listAllFallbackRefs")(function* (
  cwd: string,
) {
  const refs: VcsListRefsResult["refs"][number][] = [];
  let cursor: number | undefined;
  let isRepo = false;
  do {
    const page = yield* request(WS_METHODS.vcsListRefs, {
      cwd,
      limit: FALLBACK_PAGE_LIMIT,
      includeMatchingRemoteRefs: true,
      ...(cursor === undefined ? {} : { cursor }),
    });
    isRepo = page.isRepo;
    refs.push(...page.refs);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return { isRepo, refs };
});

export const makePartialWorktreeInventory = Effect.fn("WorktreeInventory.makePartialInventory")(
  function* (cwd: string) {
    const fallback = yield* listAllFallbackRefs(cwd);
    const byPath = new Map<string, VcsWorktreeInventoryEntry>();
    for (const ref of fallback.refs) {
      if (ref.isRemote === true || ref.worktreePath === null) continue;
      byPath.set(ref.worktreePath, {
        path: ref.worktreePath,
        headSha: null,
        branchRef: `refs/heads/${ref.name}`,
        detached: false,
        bare: false,
        locked: false,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      });
    }
    return {
      isRepo: fallback.isRepo,
      repositoryRoot: null,
      gitCommonDirectory: null,
      worktrees: [...byPath.values()],
      freshness: {
        source: "live-local" as const,
        observedAt: yield* DateTime.now,
        expiresAt: Option.none(),
      },
    };
  },
);

export const commitWorktreeInventoryRefresh = Effect.fn("WorktreeInventory.commitRefresh")(
  function* (
    registry: AtomRegistry.AtomRegistry,
    cache: EnvironmentCacheStore["Service"],
    input: {
      readonly environmentId: EnvironmentId;
      readonly inventory: VcsListWorktreesResult;
      readonly expectedRevision: number;
    },
  ) {
    return yield* persistenceLock.withPermit(input.environmentId)(
      Effect.gen(function* () {
        if (
          registry.get(worktreeInventoryCacheStateAtom(input.environmentId)).revision !==
          input.expectedRevision
        ) {
          return false;
        }
        if (input.inventory.isRepo && input.inventory.gitCommonDirectory !== null) {
          yield* (
            cache.saveWorktreeInventory?.(input.environmentId, input.inventory) ?? Effect.void
          ).pipe(
            Effect.catch((error) =>
              Effect.logWarning("Could not persist cached Git worktree inventory.").pipe(
                Effect.annotateLogs({
                  environmentId: input.environmentId,
                  ...safeErrorLogAttributes(error),
                }),
              ),
            ),
          );
        }
        return (
          registry.get(worktreeInventoryCacheStateAtom(input.environmentId)).revision ===
          input.expectedRevision
        );
      }),
    );
  },
);

export const invalidateCachedWorktreeInventories = Effect.fn("WorktreeInventory.invalidateCached")(
  function* (
    registry: AtomRegistry.AtomRegistry,
    target: {
      readonly environmentId: EnvironmentId;
      readonly cwd?: string;
      readonly gitCommonDirectory?: string;
    },
  ) {
    const cache = yield* EnvironmentCacheStore;
    yield* persistenceLock.withPermit(target.environmentId)(
      Effect.gen(function* () {
        const resolvedCommonDirectory =
          target.gitCommonDirectory ??
          (target.cwd !== undefined && cache.loadWorktreeInventories !== undefined
            ? (Option.getOrUndefined(
                findCachedWorktreeInventory(
                  target.cwd,
                  yield* cache
                    .loadWorktreeInventories(target.environmentId)
                    .pipe(Effect.orElseSucceed(() => [])),
                ),
              )?.gitCommonDirectory ?? undefined)
            : undefined);
        const removal =
          resolvedCommonDirectory !== undefined &&
          resolvedCommonDirectory !== null &&
          cache.removeWorktreeInventory !== undefined
            ? cache.removeWorktreeInventory(target.environmentId, resolvedCommonDirectory)
            : (cache.clearWorktreeInventories?.(target.environmentId) ?? Effect.void);
        yield* removal.pipe(
          Effect.catch((error) =>
            Effect.logWarning("Could not remove invalidated Git worktree inventory.").pipe(
              Effect.annotateLogs({
                environmentId: target.environmentId,
                ...safeErrorLogAttributes(error),
              }),
            ),
          ),
        );
        registry.update(worktreeInventoryCacheStateAtom(target.environmentId), (state) => ({
          revision: state.revision + 1,
        }));
      }),
    );
  },
);

export const makeWorktreeInventoryChanges = Effect.fn("WorktreeInventory.makeChanges")(function* (
  input: WorktreeInventoryInput,
  expectedRevision?: number,
  registry?: AtomRegistry.AtomRegistry,
) {
  const supervisor = yield* EnvironmentSupervisor;
  const cache = yield* EnvironmentCacheStore;
  const wakeups = yield* Effect.serviceOption(ConnectionWakeups.ConnectionWakeups);
  const environmentId = supervisor.target.environmentId;
  const persisted = yield* (
    cache.loadWorktreeInventories?.(environmentId) ??
    Effect.succeed<ReadonlyArray<VcsListWorktreesResult>>([])
  ).pipe(
    Effect.catch((error) =>
      Effect.logWarning("Could not load cached Git worktree inventories.").pipe(
        Effect.annotateLogs({ environmentId, ...safeErrorLogAttributes(error) }),
        Effect.as<ReadonlyArray<VcsListWorktreesResult>>([]),
      ),
    ),
  );
  const initialCached = findCachedWorktreeInventory(input.cwd, persisted);
  const lastComplete = yield* Ref.make(initialCached);

  const retainedView = Effect.fn("WorktreeInventory.retainedView")(function* (
    connected: boolean,
    mode: WorktreeInventoryMode,
  ) {
    return Option.match(yield* Ref.get(lastComplete), {
      onNone: () =>
        view({
          environmentId,
          requestedCwd: input.cwd,
          data: null,
          completeness: "unavailable",
          mode,
          connected,
          stale: true,
        }),
      onSome: (inventory) =>
        view({
          environmentId,
          requestedCwd: input.cwd,
          data: cachedData(inventory),
          completeness: "complete",
          mode,
          connected,
          stale: true,
        }),
    });
  });

  const refresh = Effect.fn("WorktreeInventory.refresh")(function* () {
    if (!input.supportsCompleteInventory) {
      const partial = yield* makePartialWorktreeInventory(input.cwd).pipe(
        Effect.provideService(EnvironmentSupervisor, supervisor),
      );
      const retained = yield* Ref.get(lastComplete);
      return yield* Option.match(retained, {
        onNone: () =>
          Effect.succeed(
            view({
              environmentId,
              requestedCwd: input.cwd,
              data: partial,
              completeness: "partial",
              mode: "refs-fallback",
              connected: true,
              stale: false,
            }),
          ),
        onSome: () => retainedView(true, "refs-fallback"),
      });
    }

    const inventory = yield* request(WS_METHODS.vcsListWorktrees, { cwd: input.cwd }).pipe(
      Effect.provideService(EnvironmentSupervisor, supervisor),
    );
    if (expectedRevision !== undefined && registry !== undefined) {
      const committed = yield* commitWorktreeInventoryRefresh(registry, cache, {
        environmentId,
        inventory,
        expectedRevision,
      });
      if (!committed) return yield* retainedView(true, "authoritative");
    } else if (inventory.isRepo && inventory.gitCommonDirectory !== null) {
      yield* (cache.saveWorktreeInventory?.(environmentId, inventory) ?? Effect.void).pipe(
        Effect.catch(() => Effect.void),
      );
    }
    yield* Ref.set(lastComplete, Option.some(inventory));
    return view({
      environmentId,
      requestedCwd: input.cwd,
      data: inventory,
      completeness: "complete",
      mode: "authoritative",
      connected: true,
      stale: false,
    });
  });

  const initial = Stream.fromEffect(
    retainedView(false, input.supportsCompleteInventory ? "authoritative" : "refs-fallback"),
  ).pipe(Stream.filter((candidate) => candidate.data !== null));
  const connectionChanges = Stream.concat(
    Stream.fromEffect(SubscriptionRef.get(supervisor.state)),
    SubscriptionRef.changes(supervisor.state),
  ).pipe(
    Stream.map((state) =>
      state.phase === "connected"
        ? ({ connected: true, generation: state.generation, source: "connection" } as const)
        : ({ connected: false, generation: state.generation, source: "connection" } as const),
    ),
    Stream.changes,
  );
  const foregroundChanges = Option.match(wakeups, {
    onNone: () => Stream.empty,
    onSome: (service) =>
      service.changes.pipe(
        Stream.filter(ConnectionWakeups.isApplicationActiveWakeup),
        Stream.mapEffect(() => SubscriptionRef.get(supervisor.state)),
        Stream.filterMap((state) =>
          state.phase === "connected"
            ? Result.succeed({
                connected: true as const,
                generation: state.generation,
                source: "foreground" as const,
              })
            : Result.failVoid,
        ),
      ),
  });
  const refreshChanges = Stream.merge(connectionChanges, foregroundChanges).pipe(
    Stream.switchMap((connection) =>
      connection.connected
        ? Stream.fromEffect(
            refresh().pipe(
              Effect.catch((error) =>
                Effect.logWarning("Could not refresh Git worktree inventory.").pipe(
                  Effect.annotateLogs({
                    environmentId,
                    cwd: input.cwd,
                    ...safeErrorLogAttributes(error),
                  }),
                  Effect.andThen(
                    retainedView(
                      true,
                      input.supportsCompleteInventory ? "authoritative" : "refs-fallback",
                    ),
                  ),
                ),
              ),
            ),
          )
        : Stream.fromEffect(
            retainedView(
              false,
              input.supportsCompleteInventory ? "authoritative" : "refs-fallback",
            ),
          ),
    ),
  );

  return Stream.concat(initial, refreshChanges);
});

export function createWorktreeInventoryAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | EnvironmentCacheStore | R, E>,
) {
  const family = Atom.family((environmentId: EnvironmentId) =>
    Atom.family((inputKey: string) => {
      const input = JSON.parse(inputKey) as WorktreeInventoryInput;
      return runtime
        .atom((get) => {
          const revision = get(worktreeInventoryCacheStateAtom(environmentId)).revision;
          return followStreamInEnvironment(
            environmentId,
            Stream.unwrap(
              Effect.gen(function* () {
                const registry = yield* AtomRegistry.AtomRegistry;
                return yield* makeWorktreeInventoryChanges(input, revision, registry);
              }),
            ),
          );
        })
        .pipe(
          Atom.setIdleTTL(WORKTREE_INVENTORY_IDLE_TTL_MS),
          Atom.withLabel(`environment-data:vcs:worktree-inventory:${environmentId}:${inputKey}`),
        );
    }),
  );

  return {
    inventory: (target: {
      readonly environmentId: EnvironmentId;
      readonly input: WorktreeInventoryInput;
    }) => family(target.environmentId)(JSON.stringify(target.input)),
    refresh: (
      registry: AtomRegistry.AtomRegistry,
      target: {
        readonly environmentId: EnvironmentId;
        readonly cwd?: string;
        readonly gitCommonDirectory?: string;
      },
    ) => invalidateCachedWorktreeInventories(registry, target),
  };
}
