import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

export const WORKBENCH_STATE_VERSION = 2 as const;

export type RepositoryKey = string & { readonly RepositoryKey: unique symbol };
export type WorkbenchWindowId = string;
export type WorkbenchPaneId = string;
export type WorkbenchScopeKey = string;
export type PaneLayoutPath = readonly ("first" | "second")[];
export type SplitDirection = "horizontal" | "vertical";
export type SplitSide = "above" | "below" | "left" | "right";

export type WorkspaceScope =
  | {
      kind: "machine";
      environmentId: EnvironmentId;
    }
  | {
      kind: "worktree";
      environmentId: EnvironmentId;
      repositoryKey: RepositoryKey;
      canonicalWorktreePath: string;
    };

interface PaneDescriptorBase {
  id: WorkbenchPaneId;
  scope: WorkspaceScope;
  title: string;
}

export type AgentTarget =
  | { kind: "thread"; threadId: ThreadId }
  | { kind: "draft"; draftId: string };

export type PaneDescriptor =
  | (PaneDescriptorBase & {
      kind: "agent";
      target: AgentTarget;
    })
  | (PaneDescriptorBase & {
      kind: "terminal";
      terminalId: string;
    })
  | (PaneDescriptorBase & {
      kind: "files";
      projectId: ProjectId;
      rootPath: string;
    })
  | (PaneDescriptorBase & {
      kind: "diff";
      target:
        | { kind: "thread"; threadId: ThreadId }
        | {
            kind: "worktree";
            repositoryKey: RepositoryKey;
            canonicalWorktreePath: string;
          };
    })
  | (PaneDescriptorBase & {
      kind: "git-graph";
      repositoryKey: RepositoryKey;
      canonicalWorktreePath: string;
    })
  | (PaneDescriptorBase & {
      kind: "browser";
      previewId: string;
      threadId: ThreadId | null;
    });

export type AgentPaneDescriptor = Extract<PaneDescriptor, { kind: "agent" }>;

export type PaneLayoutNode =
  | { type: "leaf"; paneId: WorkbenchPaneId }
  | {
      type: "split";
      direction: SplitDirection;
      first: PaneLayoutNode;
      second: PaneLayoutNode;
      firstSize?: number;
      secondSize?: number;
    };

export interface WorkbenchWindow {
  id: WorkbenchWindowId;
  scope: WorkspaceScope;
  title: string;
  layout: PaneLayoutNode | null;
  activePaneId: WorkbenchPaneId | null;
}

export interface WorkbenchState {
  version: typeof WORKBENCH_STATE_VERSION;
  activeScope: WorkspaceScope | null;
  windowsByScope: Record<WorkbenchScopeKey, WorkbenchWindow[] | undefined>;
  activeWindowByScope: Record<WorkbenchScopeKey, WorkbenchWindowId | undefined>;
  panes: Record<WorkbenchPaneId, PaneDescriptor | undefined>;
}

export type WorkbenchCommand =
  | { kind: "select-scope"; scope: WorkspaceScope }
  | { kind: "open-window"; window: WorkbenchWindow }
  | { kind: "activate-window"; windowId: WorkbenchWindowId }
  | { kind: "close-window"; windowId: WorkbenchWindowId }
  | { kind: "rename-window"; windowId: WorkbenchWindowId; title: string }
  | { kind: "reorder-window"; windowId: WorkbenchWindowId; toIndex: number }
  | {
      kind: "open-pane";
      windowId: WorkbenchWindowId;
      pane: PaneDescriptor;
      targetPaneId?: WorkbenchPaneId | null;
      side?: SplitSide;
    }
  | { kind: "activate-pane"; paneId: WorkbenchPaneId }
  | { kind: "close-pane"; paneId: WorkbenchPaneId }
  | { kind: "replace-pane"; paneId: WorkbenchPaneId; pane: PaneDescriptor }
  | {
      kind: "move-pane";
      paneId: WorkbenchPaneId;
      targetWindowId: WorkbenchWindowId;
      targetPaneId?: WorkbenchPaneId | null;
      side?: SplitSide;
    }
  | {
      kind: "resize-split";
      windowId: WorkbenchWindowId;
      path: PaneLayoutPath;
      firstSize: number;
      secondSize: number;
    };

export class WorkbenchInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbenchInvariantError";
  }
}

export function emptyWorkbenchState(): WorkbenchState {
  return {
    version: WORKBENCH_STATE_VERSION,
    activeScope: null,
    windowsByScope: {},
    activeWindowByScope: {},
    panes: {},
  };
}

function encodeIdentityPart(value: string): string {
  return encodeURIComponent(value);
}

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new WorkbenchInvariantError(`${label} must not be empty`);
  return normalized;
}

export function machineScope(environmentId: EnvironmentId): WorkspaceScope {
  return { kind: "machine", environmentId };
}

export function createRepositoryKey(input: {
  environmentId: EnvironmentId;
  gitCommonDirectory: string;
}): RepositoryKey {
  const commonDirectory = requireNonEmpty(input.gitCommonDirectory, "gitCommonDirectory");
  return `repository:${encodeIdentityPart(input.environmentId)}:${encodeIdentityPart(commonDirectory)}` as RepositoryKey;
}

export function repositoryKeyBelongsToEnvironment(
  repositoryKey: RepositoryKey,
  environmentId: EnvironmentId,
): boolean {
  return repositoryKey.startsWith(`repository:${encodeIdentityPart(environmentId)}:`);
}

export function createWorktreeScope(input: {
  environmentId: EnvironmentId;
  repositoryKey: RepositoryKey;
  canonicalWorktreePath: string;
}): WorkspaceScope {
  if (!repositoryKeyBelongsToEnvironment(input.repositoryKey, input.environmentId)) {
    throw new WorkbenchInvariantError("Repository identity does not belong to the environment");
  }
  return {
    kind: "worktree",
    environmentId: input.environmentId,
    repositoryKey: input.repositoryKey,
    canonicalWorktreePath: requireNonEmpty(input.canonicalWorktreePath, "canonicalWorktreePath"),
  };
}

/** Worktree paths and Git common directories must already be canonicalized by the Machine. */
export function scopeKey(scope: WorkspaceScope): WorkbenchScopeKey {
  const environment = encodeIdentityPart(scope.environmentId);
  if (scope.kind === "machine") return `machine:${environment}`;
  return [
    "worktree",
    environment,
    encodeIdentityPart(scope.repositoryKey),
    encodeIdentityPart(scope.canonicalWorktreePath),
  ].join(":");
}

export function createAgentPaneDescriptor(input: {
  id: WorkbenchPaneId;
  scope: WorkspaceScope;
  target: AgentTarget;
  title: string;
}): AgentPaneDescriptor {
  return {
    id: requireNonEmpty(input.id, "pane id"),
    kind: "agent",
    scope: input.scope,
    target: input.target,
    title: requireNonEmpty(input.title, "pane title"),
  };
}

export function agentPaneReuseKey(pane: AgentPaneDescriptor): string | null {
  if (pane.target.kind === "draft") return null;
  return [
    "agent",
    encodeIdentityPart(pane.scope.environmentId),
    encodeIdentityPart(pane.target.threadId),
  ].join(":");
}

export function paneIdsInLayout(
  layout: PaneLayoutNode | null | undefined,
  paneIds: WorkbenchPaneId[] = [],
): WorkbenchPaneId[] {
  if (!layout) return paneIds;
  if (layout.type === "leaf") {
    paneIds.push(layout.paneId);
    return paneIds;
  }
  paneIdsInLayout(layout.first, paneIds);
  paneIdsInLayout(layout.second, paneIds);
  return paneIds;
}

export function activeWindow(state: WorkbenchState): WorkbenchWindow | null {
  if (!state.activeScope) return null;
  const key = scopeKey(state.activeScope);
  const windows = state.windowsByScope[key] ?? [];
  const activeWindowId = state.activeWindowByScope[key];
  return windows.find((window) => window.id === activeWindowId) ?? windows[0] ?? null;
}

interface LocatedWindow {
  key: WorkbenchScopeKey;
  index: number;
  window: WorkbenchWindow;
}

function locateWindow(state: WorkbenchState, windowId: WorkbenchWindowId): LocatedWindow | null {
  for (const [key, windows] of Object.entries(state.windowsByScope)) {
    const index = windows?.findIndex((window) => window.id === windowId) ?? -1;
    if (index >= 0) return { key, index, window: windows![index]! };
  }
  return null;
}

function locatePane(
  state: WorkbenchState,
  paneId: WorkbenchPaneId,
): (LocatedWindow & { pane: PaneDescriptor }) | null {
  const pane = state.panes[paneId];
  if (!pane) return null;
  for (const [key, windows] of Object.entries(state.windowsByScope)) {
    const index =
      windows?.findIndex((window) => paneIdsInLayout(window.layout).includes(paneId)) ?? -1;
    if (index >= 0) return { key, index, window: windows![index]!, pane };
  }
  return null;
}

function updateLocatedWindow(
  state: WorkbenchState,
  located: LocatedWindow,
  window: WorkbenchWindow,
): WorkbenchState {
  const windows = [...(state.windowsByScope[located.key] ?? [])];
  windows[located.index] = window;
  return {
    ...state,
    windowsByScope: { ...state.windowsByScope, [located.key]: windows },
  };
}

function splitDirectionForSide(side: SplitSide): SplitDirection {
  return side === "left" || side === "right" ? "vertical" : "horizontal";
}

function insertBeforeForSide(side: SplitSide): boolean {
  return side === "left" || side === "above";
}

function splitLayoutAtPane(
  layout: PaneLayoutNode,
  targetPaneId: WorkbenchPaneId,
  paneId: WorkbenchPaneId,
  side: SplitSide,
): { layout: PaneLayoutNode; changed: boolean } {
  if (layout.type === "leaf") {
    if (layout.paneId !== targetPaneId) return { layout, changed: false };
    const next: PaneLayoutNode = { type: "leaf", paneId };
    const insertBefore = insertBeforeForSide(side);
    return {
      changed: true,
      layout: {
        type: "split",
        direction: splitDirectionForSide(side),
        first: insertBefore ? next : layout,
        second: insertBefore ? layout : next,
      },
    };
  }

  const first = splitLayoutAtPane(layout.first, targetPaneId, paneId, side);
  if (first.changed) return { changed: true, layout: { ...layout, first: first.layout } };
  const second = splitLayoutAtPane(layout.second, targetPaneId, paneId, side);
  if (second.changed) return { changed: true, layout: { ...layout, second: second.layout } };
  return { layout, changed: false };
}

function insertPane(
  layout: PaneLayoutNode | null,
  paneId: WorkbenchPaneId,
  targetPaneId: WorkbenchPaneId | null | undefined,
  side: SplitSide,
): PaneLayoutNode {
  const next: PaneLayoutNode = { type: "leaf", paneId };
  if (!layout) return next;
  if (targetPaneId) {
    const result = splitLayoutAtPane(layout, targetPaneId, paneId, side);
    if (!result.changed) throw new WorkbenchInvariantError(`Unknown target pane: ${targetPaneId}`);
    return result.layout;
  }
  const insertBefore = insertBeforeForSide(side);
  return {
    type: "split",
    direction: splitDirectionForSide(side),
    first: insertBefore ? next : layout,
    second: insertBefore ? layout : next,
  };
}

function removePane(layout: PaneLayoutNode | null, paneId: WorkbenchPaneId): PaneLayoutNode | null {
  if (!layout) return null;
  if (layout.type === "leaf") return layout.paneId === paneId ? null : layout;
  const first = removePane(layout.first, paneId);
  const second = removePane(layout.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

function resizeSplit(
  layout: PaneLayoutNode,
  path: PaneLayoutPath,
  firstSize: number,
  secondSize: number,
): PaneLayoutNode {
  if (layout.type === "leaf") {
    throw new WorkbenchInvariantError("Cannot resize a pane leaf");
  }
  if (path.length === 0) return { ...layout, firstSize, secondSize };
  const segment = path[0]!;
  const rest = path.slice(1);
  return { ...layout, [segment]: resizeSplit(layout[segment], rest, firstSize, secondSize) };
}

function revealWindow(state: WorkbenchState, located: LocatedWindow): WorkbenchState {
  return {
    ...state,
    activeScope: located.window.scope,
    activeWindowByScope: { ...state.activeWindowByScope, [located.key]: located.window.id },
  };
}

function assertFinitePositiveSize(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new WorkbenchInvariantError(`${label} must be a finite positive number`);
  }
}

function assertPaneFitsWindow(pane: PaneDescriptor, window: WorkbenchWindow): void {
  if (scopeKey(pane.scope) !== scopeKey(window.scope)) {
    throw new WorkbenchInvariantError("Pane scope does not match window scope");
  }
}

function removeLocatedWindow(
  state: WorkbenchState,
  located: LocatedWindow,
  deleteOwnedPanes: boolean,
): WorkbenchState {
  const windows = [...(state.windowsByScope[located.key] ?? [])];
  windows.splice(located.index, 1);
  const panes = { ...state.panes };
  if (deleteOwnedPanes) {
    for (const paneId of paneIdsInLayout(located.window.layout)) delete panes[paneId];
  }

  const activeWindowByScope = { ...state.activeWindowByScope };
  if (activeWindowByScope[located.key] === located.window.id) {
    const nextActive = windows[Math.min(located.index, windows.length - 1)] ?? windows[0];
    if (nextActive) activeWindowByScope[located.key] = nextActive.id;
    else delete activeWindowByScope[located.key];
  }

  const windowsByScope = { ...state.windowsByScope };
  if (windows.length > 0) windowsByScope[located.key] = windows;
  else delete windowsByScope[located.key];
  return { ...state, windowsByScope, activeWindowByScope, panes };
}

function detachPane(state: WorkbenchState, paneId: WorkbenchPaneId): WorkbenchState {
  const located = locatePane(state, paneId);
  if (!located) return state;
  const layout = removePane(located.window.layout, paneId);
  if (!layout) return removeLocatedWindow(state, located, false);
  const remainingPaneIds = paneIdsInLayout(layout);
  return updateLocatedWindow(state, located, {
    ...located.window,
    layout,
    activePaneId:
      located.window.activePaneId === paneId
        ? (remainingPaneIds[0] ?? null)
        : located.window.activePaneId,
  });
}

function deletePane(state: WorkbenchState, paneId: WorkbenchPaneId): WorkbenchState {
  const detached = detachPane(state, paneId);
  if (!detached.panes[paneId]) return detached;
  const panes = { ...detached.panes };
  delete panes[paneId];
  return { ...detached, panes };
}

function isActivePane(state: WorkbenchState, paneId: WorkbenchPaneId): boolean {
  const located = locatePane(state, paneId);
  if (!located || !state.activeScope || scopeKey(state.activeScope) !== located.key) return false;
  return (
    state.activeWindowByScope[located.key] === located.window.id &&
    located.window.activePaneId === paneId
  );
}

function paneOrder(state: WorkbenchState, paneId: WorkbenchPaneId): number {
  let index = 0;
  for (const windows of Object.values(state.windowsByScope)) {
    for (const window of windows ?? []) {
      for (const candidate of paneIdsInLayout(window.layout)) {
        if (candidate === paneId) return index;
        index += 1;
      }
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function duplicateAgentPane(
  state: WorkbenchState,
  requested: AgentPaneDescriptor,
  excludingPaneId?: WorkbenchPaneId,
): AgentPaneDescriptor | null {
  const requestedKey = agentPaneReuseKey(requested);
  if (!requestedKey) return null;
  return (
    Object.values(state.panes).find(
      (pane): pane is AgentPaneDescriptor =>
        pane?.kind === "agent" &&
        pane.id !== excludingPaneId &&
        agentPaneReuseKey(pane) === requestedKey,
    ) ?? null
  );
}

export function applyWorkbenchCommand(
  state: WorkbenchState,
  command: WorkbenchCommand,
): WorkbenchState {
  switch (command.kind) {
    case "select-scope":
      return { ...state, activeScope: command.scope };

    case "open-window": {
      if (locateWindow(state, command.window.id)) {
        throw new WorkbenchInvariantError(`Window already exists: ${command.window.id}`);
      }
      if (command.window.layout || command.window.activePaneId) {
        throw new WorkbenchInvariantError("New windows must be empty");
      }
      const key = scopeKey(command.window.scope);
      return {
        ...state,
        activeScope: command.window.scope,
        windowsByScope: {
          ...state.windowsByScope,
          [key]: [...(state.windowsByScope[key] ?? []), command.window],
        },
        activeWindowByScope: { ...state.activeWindowByScope, [key]: command.window.id },
      };
    }

    case "activate-window": {
      const located = locateWindow(state, command.windowId);
      if (!located) throw new WorkbenchInvariantError(`Unknown window: ${command.windowId}`);
      return revealWindow(state, located);
    }

    case "close-window": {
      const located = locateWindow(state, command.windowId);
      return located ? removeLocatedWindow(state, located, true) : state;
    }

    case "rename-window": {
      const located = locateWindow(state, command.windowId);
      if (!located) throw new WorkbenchInvariantError(`Unknown window: ${command.windowId}`);
      return updateLocatedWindow(state, located, {
        ...located.window,
        title: requireNonEmpty(command.title, "window title"),
      });
    }

    case "reorder-window": {
      const located = locateWindow(state, command.windowId);
      if (!located) throw new WorkbenchInvariantError(`Unknown window: ${command.windowId}`);
      const windows = [...(state.windowsByScope[located.key] ?? [])];
      if (
        !Number.isInteger(command.toIndex) ||
        command.toIndex < 0 ||
        command.toIndex >= windows.length
      ) {
        throw new WorkbenchInvariantError("Window index is out of range");
      }
      windows.splice(located.index, 1);
      windows.splice(command.toIndex, 0, located.window);
      return { ...state, windowsByScope: { ...state.windowsByScope, [located.key]: windows } };
    }

    case "open-pane": {
      if (command.pane.kind === "agent") {
        const duplicate = duplicateAgentPane(state, command.pane);
        if (duplicate) {
          const existing = locatePane(state, duplicate.id);
          if (!existing) throw new WorkbenchInvariantError("Agent pane has no owning window");
          return updateLocatedWindow(revealWindow(state, existing), existing, {
            ...existing.window,
            activePaneId: duplicate.id,
          });
        }
      }
      if (state.panes[command.pane.id]) {
        throw new WorkbenchInvariantError(`Pane already exists: ${command.pane.id}`);
      }
      const located = locateWindow(state, command.windowId);
      if (!located) throw new WorkbenchInvariantError(`Unknown window: ${command.windowId}`);
      assertPaneFitsWindow(command.pane, located.window);
      const window = {
        ...located.window,
        layout: insertPane(
          located.window.layout,
          command.pane.id,
          command.targetPaneId,
          command.side ?? "right",
        ),
        activePaneId: command.pane.id,
      };
      const next = updateLocatedWindow(state, located, window);
      return {
        ...revealWindow(next, { ...located, window }),
        panes: { ...next.panes, [command.pane.id]: command.pane },
      };
    }

    case "activate-pane": {
      const located = locatePane(state, command.paneId);
      if (!located) throw new WorkbenchInvariantError(`Unknown pane: ${command.paneId}`);
      const next = updateLocatedWindow(state, located, {
        ...located.window,
        activePaneId: command.paneId,
      });
      return revealWindow(next, located);
    }

    case "close-pane":
      return deletePane(state, command.paneId);

    case "replace-pane": {
      const located = locatePane(state, command.paneId);
      if (!located) throw new WorkbenchInvariantError(`Unknown pane: ${command.paneId}`);
      if (command.pane.id !== command.paneId) {
        throw new WorkbenchInvariantError("Replacing a pane cannot change its opaque id");
      }
      assertPaneFitsWindow(command.pane, located.window);

      let next = state;
      if (command.pane.kind === "agent") {
        const duplicate = duplicateAgentPane(state, command.pane, command.paneId);
        if (duplicate) {
          const currentWins =
            isActivePane(state, command.paneId) ||
            (!isActivePane(state, duplicate.id) &&
              paneOrder(state, command.paneId) < paneOrder(state, duplicate.id));
          if (!currentWins) return deletePane(state, command.paneId);
          next = deletePane(state, duplicate.id);
        }
      }
      return { ...next, panes: { ...next.panes, [command.paneId]: command.pane } };
    }

    case "move-pane": {
      const source = locatePane(state, command.paneId);
      if (!source) throw new WorkbenchInvariantError(`Unknown pane: ${command.paneId}`);
      const targetBeforeDetach = locateWindow(state, command.targetWindowId);
      if (!targetBeforeDetach) {
        throw new WorkbenchInvariantError(`Unknown window: ${command.targetWindowId}`);
      }
      assertPaneFitsWindow(source.pane, targetBeforeDetach.window);
      if (command.targetPaneId === command.paneId) {
        throw new WorkbenchInvariantError("A pane cannot be moved relative to itself");
      }

      const detached = detachPane(state, command.paneId);
      const target = locateWindow(detached, command.targetWindowId);
      if (!target) throw new WorkbenchInvariantError("Move removed its target window");
      const window = {
        ...target.window,
        layout: insertPane(
          target.window.layout,
          command.paneId,
          command.targetPaneId,
          command.side ?? "right",
        ),
        activePaneId: command.paneId,
      };
      return revealWindow(updateLocatedWindow(detached, target, window), { ...target, window });
    }

    case "resize-split": {
      assertFinitePositiveSize(command.firstSize, "firstSize");
      assertFinitePositiveSize(command.secondSize, "secondSize");
      const located = locateWindow(state, command.windowId);
      if (!located) throw new WorkbenchInvariantError(`Unknown window: ${command.windowId}`);
      if (!located.window.layout) {
        throw new WorkbenchInvariantError("Cannot resize an empty window");
      }
      return updateLocatedWindow(state, located, {
        ...located.window,
        layout: resizeSplit(
          located.window.layout,
          command.path,
          command.firstSize,
          command.secondSize,
        ),
      });
    }
  }
}
