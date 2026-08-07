import {
  EnvironmentId,
  WS_METHODS,
  type VcsListRefsInput,
  type VcsListRefsResult,
  type VcsListWorktreesResult,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AtomRegistry } from "effect/unstable/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as ConnectionWakeups from "../connection/wakeups.ts";
import * as Persistence from "../platform/persistence.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  commitWorktreeInventoryRefresh,
  findCachedWorktreeInventory,
  invalidateCachedWorktreeInventories,
  makeWorktreeInventoryChanges,
} from "./worktrees.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const TARGET = new PrimaryConnectionTarget({
  environmentId: ENVIRONMENT_ID,
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const CONNECTED: SupervisorConnectionState = {
  ...AVAILABLE_CONNECTION_STATE,
  desired: true,
  network: "online",
  phase: "connected",
  attempt: 1,
  generation: 1,
};
const OBSERVED_AT = DateTime.makeUnsafe("2026-08-06T00:00:00.000Z");
const CACHED_INVENTORY: VcsListWorktreesResult = {
  isRepo: true,
  repositoryRoot: "/repo",
  gitCommonDirectory: "/repo/.git",
  worktrees: [
    {
      path: "/repo",
      headSha: "abc123",
      branchRef: "refs/heads/main",
      detached: false,
      bare: false,
      locked: false,
      lockedReason: null,
      prunable: false,
      prunableReason: null,
    },
  ],
  freshness: {
    source: "live-local",
    observedAt: OBSERVED_AT,
    expiresAt: Option.none(),
  },
};

function session(client: WsRpcProtocolClient): RpcSession {
  return {
    client,
    initialConfig: Effect.never,
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

const makeSupervisor = Effect.fn(function* (client: WsRpcProtocolClient) {
  return EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: yield* SubscriptionRef.make(CONNECTED),
    session: yield* SubscriptionRef.make(Option.some(session(client))),
    prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
});

function cache(
  inventories: ReadonlyArray<VcsListWorktreesResult>,
  overrides: Partial<Persistence.EnvironmentCacheStore["Service"]> = {},
) {
  return Persistence.EnvironmentCacheStore.of({
    loadShell: () => Effect.succeed(Option.none()),
    saveShell: () => Effect.void,
    loadThread: () => Effect.succeed(Option.none()),
    saveThread: () => Effect.void,
    removeThread: () => Effect.void,
    loadServerConfig: () => Effect.succeed(Option.none()),
    saveServerConfig: () => Effect.void,
    loadVcsRefs: () => Effect.succeed(Option.none()),
    saveVcsRefs: () => Effect.void,
    removeVcsRefs: () => Effect.void,
    clearVcsRefs: () => Effect.void,
    loadWorktreeInventories: () => Effect.succeed(inventories),
    saveWorktreeInventory: () => Effect.void,
    removeWorktreeInventory: () => Effect.void,
    clearWorktreeInventories: () => Effect.void,
    clear: () => Effect.void,
    ...overrides,
  });
}

describe("worktree inventory", () => {
  it("selects the deepest cached worktree containing a workspace", () => {
    const nested: VcsListWorktreesResult = {
      ...CACHED_INVENTORY,
      repositoryRoot: "/repo/nested",
      gitCommonDirectory: "/repo/nested/.git",
      worktrees: [{ ...CACHED_INVENTORY.worktrees[0]!, path: "/repo/nested" }],
    };

    expect(
      Option.getOrThrow(
        findCachedWorktreeInventory("/repo/nested/packages/app", [CACHED_INVENTORY, nested]),
      ).gitCommonDirectory,
    ).toBe("/repo/nested/.git");
  });

  it.effect("emits the last complete snapshot before a blocked live refresh", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const client = {
          [WS_METHODS.vcsListWorktrees]: () => Effect.never,
        } as unknown as WsRpcProtocolClient;
        const supervisor = yield* makeSupervisor(client);
        const result = yield* Stream.unwrap(
          makeWorktreeInventoryChanges({
            cwd: "/repo/packages/app",
            supportsCompleteInventory: true,
          }).pipe(
            Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
            Effect.provideService(Persistence.EnvironmentCacheStore, cache([CACHED_INVENTORY])),
          ),
        ).pipe(Stream.runHead);
        const first = Option.getOrThrow(result);

        expect(first.data?.gitCommonDirectory).toBe("/repo/.git");
        expect(first.data?.freshness.source).toBe("cached-local");
        expect(first.completeness).toBe("complete");
        expect(first.stale).toBe(true);
        expect(first.mutationsEnabled).toBe(false);
      }),
    ),
  );

  it.effect("fully pages old-server refs and labels the result partial", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requests = yield* Ref.make<ReadonlyArray<VcsListRefsInput>>([]);
        const client = {
          [WS_METHODS.vcsListRefs]: (input: VcsListRefsInput) => {
            const page: VcsListRefsResult = {
              refs: [
                {
                  name: input.cursor === undefined ? "main" : "feature",
                  current: input.cursor === undefined,
                  isDefault: input.cursor === undefined,
                  worktreePath: input.cursor === undefined ? "/repo" : "/worktrees/feature",
                },
              ],
              isRepo: true,
              hasPrimaryRemote: true,
              nextCursor: input.cursor === undefined ? 1 : null,
              totalCount: 2,
            };
            return Ref.update(requests, (current) => [...current, input]).pipe(Effect.as(page));
          },
        } as unknown as WsRpcProtocolClient;
        const supervisor = yield* makeSupervisor(client);
        const result = yield* Stream.unwrap(
          makeWorktreeInventoryChanges({ cwd: "/repo", supportsCompleteInventory: false }).pipe(
            Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
            Effect.provideService(Persistence.EnvironmentCacheStore, cache([])),
          ),
        ).pipe(Stream.runHead);
        const first = Option.getOrThrow(result);

        expect(first.mode).toBe("refs-fallback");
        expect(first.completeness).toBe("partial");
        expect(first.data?.worktrees.map((worktree) => worktree.path)).toEqual([
          "/repo",
          "/worktrees/feature",
        ]);
        expect(first.mutationsEnabled).toBe(false);
        expect((yield* Ref.get(requests)).map((input) => input.cursor)).toEqual([undefined, 1]);
      }),
    ),
  );

  it.effect("refreshes authoritative inventory when the application becomes active", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstRequest = yield* Deferred.make<void>();
        const firstEmission = yield* Deferred.make<void>();
        const secondRequest = yield* Deferred.make<void>();
        const requests = yield* Ref.make(0);
        const wakeups = yield* Queue.unbounded<ConnectionWakeups.ConnectionWakeup>();
        const client = {
          [WS_METHODS.vcsListWorktrees]: () =>
            Ref.getAndUpdate(requests, (count) => count + 1).pipe(
              Effect.tap((count) =>
                Deferred.succeed(count === 0 ? firstRequest : secondRequest, undefined),
              ),
              Effect.as(CACHED_INVENTORY),
            ),
        } as unknown as WsRpcProtocolClient;
        const supervisor = yield* makeSupervisor(client);
        const changes = yield* makeWorktreeInventoryChanges({
          cwd: "/repo",
          supportsCompleteInventory: true,
        }).pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
          Effect.provideService(Persistence.EnvironmentCacheStore, cache([])),
          Effect.provideService(
            ConnectionWakeups.ConnectionWakeups,
            ConnectionWakeups.ConnectionWakeups.of({ changes: Stream.fromQueue(wakeups) }),
          ),
        );
        const fiber = yield* Effect.forkChild(
          changes.pipe(
            Stream.tap(() => Deferred.succeed(firstEmission, undefined)),
            Stream.take(2),
            Stream.runDrain,
          ),
        );

        yield* Deferred.await(firstRequest);
        yield* Deferred.await(firstEmission);
        yield* Queue.offer(wakeups, "application-active");
        yield* Deferred.await(secondRequest);
        yield* Fiber.join(fiber);

        expect(yield* Ref.get(requests)).toBe(2);
      }),
    ),
  );

  it.effect("retains the complete snapshot offline and refreshes after reconnect", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const firstEmission = yield* Deferred.make<void>();
        const offlineEmission = yield* Deferred.make<void>();
        const secondRequest = yield* Deferred.make<void>();
        const requests = yield* Ref.make(0);
        const client = {
          [WS_METHODS.vcsListWorktrees]: () =>
            Ref.getAndUpdate(requests, (count) => count + 1).pipe(
              Effect.tap((count) =>
                count === 1 ? Deferred.succeed(secondRequest, undefined) : Effect.void,
              ),
              Effect.as(CACHED_INVENTORY),
            ),
        } as unknown as WsRpcProtocolClient;
        const supervisor = yield* makeSupervisor(client);
        const changes = yield* makeWorktreeInventoryChanges({
          cwd: "/repo",
          supportsCompleteInventory: true,
        }).pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
          Effect.provideService(Persistence.EnvironmentCacheStore, cache([])),
        );
        const fiber = yield* Effect.forkChild(
          changes.pipe(
            Stream.tap((change) =>
              change.connected
                ? Deferred.succeed(firstEmission, undefined)
                : Deferred.succeed(offlineEmission, undefined),
            ),
            Stream.take(3),
            Stream.runDrain,
          ),
        );

        yield* Deferred.await(firstEmission);
        const offline: SupervisorConnectionState = {
          ...CONNECTED,
          phase: "offline",
          generation: 1,
        };
        yield* SubscriptionRef.set(supervisor.state, offline);
        yield* Deferred.await(offlineEmission);
        yield* SubscriptionRef.set(supervisor.state, { ...CONNECTED, generation: 2 });
        yield* Deferred.await(secondRequest);
        yield* Fiber.join(fiber);

        expect(yield* Ref.get(requests)).toBe(2);
      }),
    ),
  );

  it.effect("does not commit a refresh superseded by invalidation", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (value) =>
          Effect.sync(() => value.dispose()),
        );
        const removed = yield* Ref.make<ReadonlyArray<string>>([]);
        const store = cache([], {
          removeWorktreeInventory: (_environmentId, commonDirectory) =>
            Ref.update(removed, (current) => [...current, commonDirectory]),
        });

        yield* invalidateCachedWorktreeInventories(registry, {
          environmentId: ENVIRONMENT_ID,
          gitCommonDirectory: "/repo/.git",
        }).pipe(Effect.provideService(Persistence.EnvironmentCacheStore, store));

        expect(
          yield* commitWorktreeInventoryRefresh(registry, store, {
            environmentId: ENVIRONMENT_ID,
            inventory: CACHED_INVENTORY,
            expectedRevision: 0,
          }),
        ).toBe(false);
        expect(yield* Ref.get(removed)).toEqual(["/repo/.git"]);
      }),
    ),
  );

  it.effect("serializes persistence so invalidation clears an in-flight old refresh", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (value) =>
          Effect.sync(() => value.dispose()),
        );
        const saveStarted = yield* Deferred.make<void>();
        const allowSave = yield* Deferred.make<void>();
        const events = yield* Ref.make<ReadonlyArray<string>>([]);
        const store = cache([], {
          saveWorktreeInventory: () =>
            Deferred.succeed(saveStarted, undefined).pipe(
              Effect.andThen(Deferred.await(allowSave)),
              Effect.andThen(Ref.update(events, (current) => [...current, "saved"])),
            ),
          removeWorktreeInventory: () => Ref.update(events, (current) => [...current, "removed"]),
        });

        const commit = yield* Effect.forkChild(
          commitWorktreeInventoryRefresh(registry, store, {
            environmentId: ENVIRONMENT_ID,
            inventory: CACHED_INVENTORY,
            expectedRevision: 0,
          }),
        );
        yield* Deferred.await(saveStarted);
        const invalidation = yield* Effect.forkChild(
          invalidateCachedWorktreeInventories(registry, {
            environmentId: ENVIRONMENT_ID,
            gitCommonDirectory: "/repo/.git",
          }).pipe(Effect.provideService(Persistence.EnvironmentCacheStore, store)),
        );
        yield* Deferred.succeed(allowSave, undefined);
        yield* Fiber.join(commit);
        yield* Fiber.join(invalidation);

        expect(yield* Ref.get(events)).toEqual(["saved", "removed"]);
      }),
    ),
  );
});
