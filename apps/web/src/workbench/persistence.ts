import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

import {
  WORKBENCH_STATE_VERSION,
  agentPaneReuseKey,
  createWorktreeScope,
  emptyWorkbenchState,
  paneIdsInLayout,
  repositoryKeyBelongsToEnvironment,
  scopeKey,
  type AgentPaneDescriptor,
  type PaneDescriptor,
  type PaneLayoutNode,
  type RepositoryKey,
  type WorkbenchPaneId,
  type WorkbenchState,
  type WorkbenchWindow,
  type WorkspaceScope,
} from "./model";

const MAX_LAYOUT_DEPTH = 32;

export type WorkbenchRepair =
  | "dropped-invalid-pane"
  | "dropped-invalid-window"
  | "dropped-window-with-mismatched-scope"
  | "dropped-invalid-layout-leaf"
  | "dropped-duplicate-pane"
  | "dropped-duplicate-agent"
  | "repaired-active-pane"
  | "repaired-active-window"
  | "dropped-orphan-pane";

export interface WorkbenchQuarantine {
  reason: "malformed-root" | "unsupported-version";
  version: unknown;
  payload: unknown;
}

export interface WorkbenchRestoreResult {
  state: WorkbenchState;
  repairs: WorkbenchRepair[];
  quarantine: WorkbenchQuarantine | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readScope(value: unknown): WorkspaceScope | null {
  if (!isRecord(value)) return null;
  const environmentId = nonEmptyString(value.environmentId) as EnvironmentId | null;
  if (!environmentId) return null;
  if (value.kind === "machine") return { kind: "machine", environmentId };
  if (value.kind !== "worktree") return null;
  const repositoryKey = nonEmptyString(value.repositoryKey) as RepositoryKey | null;
  const canonicalWorktreePath = nonEmptyString(value.canonicalWorktreePath);
  if (
    !repositoryKey ||
    !canonicalWorktreePath ||
    !repositoryKeyBelongsToEnvironment(repositoryKey, environmentId)
  ) {
    return null;
  }
  return createWorktreeScope({ environmentId, repositoryKey, canonicalWorktreePath });
}

function readAgentTarget(value: unknown): AgentPaneDescriptor["target"] | null {
  if (!isRecord(value)) return null;
  if (value.kind === "thread") {
    const threadId = nonEmptyString(value.threadId) as ThreadId | null;
    return threadId ? { kind: "thread", threadId } : null;
  }
  if (value.kind === "draft") {
    const draftId = nonEmptyString(value.draftId);
    return draftId ? { kind: "draft", draftId } : null;
  }
  return null;
}

function readPane(id: WorkbenchPaneId, value: unknown): PaneDescriptor | null {
  if (!isRecord(value) || value.id !== id) return null;
  const scope = readScope(value.scope);
  const title = nonEmptyString(value.title);
  if (!scope || !title) return null;
  const base = { id, scope, title };

  switch (value.kind) {
    case "agent": {
      const target = readAgentTarget(value.target);
      return target ? { ...base, kind: "agent", target } : null;
    }
    case "terminal": {
      const terminalId = nonEmptyString(value.terminalId);
      return terminalId ? { ...base, kind: "terminal", terminalId } : null;
    }
    case "files": {
      const projectId = nonEmptyString(value.projectId) as ProjectId | null;
      const rootPath = nonEmptyString(value.rootPath);
      return projectId && rootPath ? { ...base, kind: "files", projectId, rootPath } : null;
    }
    case "diff": {
      if (!isRecord(value.target)) return null;
      if (value.target.kind === "thread") {
        const threadId = nonEmptyString(value.target.threadId) as ThreadId | null;
        return threadId ? { ...base, kind: "diff", target: { kind: "thread", threadId } } : null;
      }
      if (value.target.kind === "worktree") {
        const repositoryKey = nonEmptyString(value.target.repositoryKey) as RepositoryKey | null;
        const canonicalWorktreePath = nonEmptyString(value.target.canonicalWorktreePath);
        return repositoryKey &&
          canonicalWorktreePath &&
          repositoryKeyBelongsToEnvironment(repositoryKey, scope.environmentId)
          ? {
              ...base,
              kind: "diff",
              target: { kind: "worktree", repositoryKey, canonicalWorktreePath },
            }
          : null;
      }
      return null;
    }
    case "git-graph": {
      const repositoryKey = nonEmptyString(value.repositoryKey) as RepositoryKey | null;
      const canonicalWorktreePath = nonEmptyString(value.canonicalWorktreePath);
      return repositoryKey &&
        canonicalWorktreePath &&
        repositoryKeyBelongsToEnvironment(repositoryKey, scope.environmentId)
        ? { ...base, kind: "git-graph", repositoryKey, canonicalWorktreePath }
        : null;
    }
    case "browser": {
      const previewId = nonEmptyString(value.previewId);
      const threadId =
        value.threadId === null ? null : (nonEmptyString(value.threadId) as ThreadId | null);
      return previewId && (value.threadId === null || threadId)
        ? { ...base, kind: "browser", previewId, threadId }
        : null;
    }
    default:
      return null;
  }
}

interface LayoutClaims {
  paneIds: Set<WorkbenchPaneId>;
  agentRefs: Set<string>;
}

function readLayout(
  value: unknown,
  panes: Readonly<Record<WorkbenchPaneId, PaneDescriptor | undefined>>,
  expectedScopeKey: string,
  claims: LayoutClaims,
  repairs: WorkbenchRepair[],
  depth = 0,
): PaneLayoutNode | null {
  if (!isRecord(value) || depth > MAX_LAYOUT_DEPTH) return null;
  if (value.type === "leaf") {
    const paneId = nonEmptyString(value.paneId);
    const pane = paneId ? panes[paneId] : undefined;
    if (!pane || scopeKey(pane.scope) !== expectedScopeKey) {
      repairs.push("dropped-invalid-layout-leaf");
      return null;
    }
    if (claims.paneIds.has(pane.id)) {
      repairs.push("dropped-duplicate-pane");
      return null;
    }
    if (pane.kind === "agent") {
      const agentRef = agentPaneReuseKey(pane);
      if (agentRef && claims.agentRefs.has(agentRef)) {
        repairs.push("dropped-duplicate-agent");
        return null;
      }
      if (agentRef) claims.agentRefs.add(agentRef);
    }
    claims.paneIds.add(pane.id);
    return { type: "leaf", paneId: pane.id };
  }
  if (value.type !== "split") return null;
  const direction = value.direction === "vertical" ? "vertical" : "horizontal";
  const first = readLayout(value.first, panes, expectedScopeKey, claims, repairs, depth + 1);
  const second = readLayout(value.second, panes, expectedScopeKey, claims, repairs, depth + 1);
  if (!first) return second;
  if (!second) return first;
  const firstSize =
    typeof value.firstSize === "number" && Number.isFinite(value.firstSize) && value.firstSize > 0
      ? value.firstSize
      : undefined;
  const secondSize =
    typeof value.secondSize === "number" &&
    Number.isFinite(value.secondSize) &&
    value.secondSize > 0
      ? value.secondSize
      : undefined;
  return {
    type: "split",
    direction,
    first,
    second,
    ...(firstSize === undefined ? {} : { firstSize }),
    ...(secondSize === undefined ? {} : { secondSize }),
  };
}

function readPanes(
  value: unknown,
  repairs: WorkbenchRepair[],
): Record<WorkbenchPaneId, PaneDescriptor | undefined> {
  if (!isRecord(value)) return {};
  const panes: Record<WorkbenchPaneId, PaneDescriptor | undefined> = {};
  for (const [id, candidate] of Object.entries(value)) {
    const pane = readPane(id, candidate);
    if (pane) panes[id] = pane;
    else repairs.push("dropped-invalid-pane");
  }
  return panes;
}

function readWindow(
  value: unknown,
  expectedScopeKey: string,
  panes: Readonly<Record<WorkbenchPaneId, PaneDescriptor | undefined>>,
  claims: LayoutClaims,
  repairs: WorkbenchRepair[],
): WorkbenchWindow | null {
  if (!isRecord(value)) {
    repairs.push("dropped-invalid-window");
    return null;
  }
  const id = nonEmptyString(value.id);
  const title = nonEmptyString(value.title);
  const scope = readScope(value.scope);
  if (!id || !title || !scope) {
    repairs.push("dropped-invalid-window");
    return null;
  }
  if (scopeKey(scope) !== expectedScopeKey) {
    repairs.push("dropped-window-with-mismatched-scope");
    return null;
  }
  const layout = readLayout(value.layout, panes, expectedScopeKey, claims, repairs);
  const paneIds = paneIdsInLayout(layout);
  const requestedActivePaneId = nonEmptyString(value.activePaneId);
  const activePaneId =
    requestedActivePaneId && paneIds.includes(requestedActivePaneId)
      ? requestedActivePaneId
      : (paneIds[0] ?? null);
  if (requestedActivePaneId !== activePaneId && requestedActivePaneId !== null) {
    repairs.push("repaired-active-pane");
  }
  return { id, title, scope, layout, activePaneId };
}

/** Restores composition only. Surface runtime state remains behind each Pane adapter. */
export function restoreWorkbenchState(value: unknown): WorkbenchRestoreResult {
  if (value === null || value === undefined) {
    return { state: emptyWorkbenchState(), repairs: [], quarantine: null };
  }
  if (!isRecord(value)) {
    return {
      state: emptyWorkbenchState(),
      repairs: [],
      quarantine: { reason: "malformed-root", version: null, payload: value },
    };
  }
  if (value.version !== WORKBENCH_STATE_VERSION) {
    return {
      state: emptyWorkbenchState(),
      repairs: [],
      quarantine: {
        reason: "unsupported-version",
        version: value.version,
        payload: value,
      },
    };
  }

  const repairs: WorkbenchRepair[] = [];
  const candidatePanes = readPanes(value.panes, repairs);
  const candidateWindows = isRecord(value.windowsByScope) ? value.windowsByScope : {};
  const candidateActiveWindows = isRecord(value.activeWindowByScope)
    ? value.activeWindowByScope
    : {};
  const windowsByScope: WorkbenchState["windowsByScope"] = {};
  const activeWindowByScope: WorkbenchState["activeWindowByScope"] = {};
  const claims: LayoutClaims = { paneIds: new Set(), agentRefs: new Set() };
  const windowIds = new Set<string>();

  for (const [key, valueForScope] of Object.entries(candidateWindows)) {
    if (!Array.isArray(valueForScope)) continue;
    const windows: WorkbenchWindow[] = [];
    for (const candidateWindow of valueForScope) {
      const window = readWindow(candidateWindow, key, candidatePanes, claims, repairs);
      if (!window) continue;
      if (windowIds.has(window.id)) {
        repairs.push("dropped-invalid-window");
        continue;
      }
      windowIds.add(window.id);
      windows.push(window);
    }
    if (windows.length === 0) continue;
    windowsByScope[key] = windows;
    const requestedActiveWindowId = nonEmptyString(candidateActiveWindows[key]);
    const activeWindowId = windows.some((window) => window.id === requestedActiveWindowId)
      ? requestedActiveWindowId!
      : windows[0]!.id;
    if (requestedActiveWindowId !== activeWindowId) repairs.push("repaired-active-window");
    activeWindowByScope[key] = activeWindowId;
  }

  const panes: WorkbenchState["panes"] = {};
  for (const paneId of claims.paneIds) panes[paneId] = candidatePanes[paneId];
  for (const paneId of Object.keys(candidatePanes)) {
    if (!claims.paneIds.has(paneId)) repairs.push("dropped-orphan-pane");
  }

  return {
    state: {
      version: WORKBENCH_STATE_VERSION,
      activeScope: readScope(value.activeScope),
      windowsByScope,
      activeWindowByScope,
      panes,
    },
    repairs,
    quarantine: null,
  };
}
