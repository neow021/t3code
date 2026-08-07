import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import {
  activeWindow,
  agentPaneReuseKey,
  createAgentPaneDescriptor,
  paneIdsInLayout,
  scopeKey,
  type AgentPaneDescriptor,
  type AgentTarget,
  type PaneDescriptor,
  type SplitSide,
  type WorkbenchCommand,
  type WorkbenchPaneId,
  type WorkbenchState,
  type WorkbenchWindow,
  type WorkbenchWindowId,
  type WorkspaceScope,
} from "./model";

export interface WorkbenchNavigationStatePort {
  readonly getState: () => WorkbenchState;
  readonly dispatch: (command: WorkbenchCommand) => void;
}

export interface WorkbenchNavigationOptions {
  readonly state: WorkbenchNavigationStatePort;
  readonly createId?: (kind: "window" | "pane") => string;
}

export interface RevealAgentInput {
  readonly scope: WorkspaceScope;
  readonly target: AgentTarget;
  readonly title: string;
  readonly windowTitle?: string;
  readonly targetPaneId?: WorkbenchPaneId | null;
  readonly side?: SplitSide;
}

export interface OpenPaneInput {
  readonly pane: PaneDescriptor;
  readonly windowTitle?: string;
  readonly targetPaneId?: WorkbenchPaneId | null;
  readonly side?: SplitSide;
}

let fallbackId = 0;

function defaultCreateId(kind: "window" | "pane"): string {
  fallbackId += 1;
  return `${kind}:local-${Date.now().toString(36)}-${fallbackId}`;
}

function findWindow(state: WorkbenchState, windowId: WorkbenchWindowId): WorkbenchWindow | null {
  for (const windows of Object.values(state.windowsByScope)) {
    const window = windows?.find((candidate) => candidate.id === windowId);
    if (window !== undefined) return window;
  }
  return null;
}

function findPaneWindow(state: WorkbenchState, paneId: WorkbenchPaneId): WorkbenchWindow | null {
  for (const windows of Object.values(state.windowsByScope)) {
    const window = windows?.find((candidate) => paneIdsInLayout(candidate.layout).includes(paneId));
    if (window !== undefined) return window;
  }
  return null;
}

function activeWindowInScope(state: WorkbenchState, scope: WorkspaceScope): WorkbenchWindow | null {
  const key = scopeKey(scope);
  const windows = state.windowsByScope[key] ?? [];
  const activeWindowId = state.activeWindowByScope[key];
  return windows.find((window) => window.id === activeWindowId) ?? windows[0] ?? null;
}

function matchingAgentPane(
  state: WorkbenchState,
  requested: AgentPaneDescriptor,
): AgentPaneDescriptor | null {
  const reuseKey = agentPaneReuseKey(requested);
  return (
    Object.values(state.panes).find(
      (pane): pane is AgentPaneDescriptor =>
        pane?.kind === "agent" &&
        (reuseKey !== null
          ? agentPaneReuseKey(pane) === reuseKey
          : pane.target.kind === "draft" &&
            requested.target.kind === "draft" &&
            pane.target.draftId === requested.target.draftId),
    ) ?? null
  );
}

export function createWorkbenchNavigation(options: WorkbenchNavigationOptions) {
  const createId = options.createId ?? defaultCreateId;
  const current = () => options.state.getState();

  const revealWindow = (windowId: WorkbenchWindowId): WorkbenchWindowId => {
    if (findWindow(current(), windowId) === null) throw new Error(`Unknown window: ${windowId}`);
    options.state.dispatch({ kind: "activate-window", windowId });
    return windowId;
  };

  const revealPane = (paneId: WorkbenchPaneId): WorkbenchPaneId => {
    if (findPaneWindow(current(), paneId) === null) throw new Error(`Unknown pane: ${paneId}`);
    options.state.dispatch({ kind: "activate-pane", paneId });
    return paneId;
  };

  const ensureWindow = (scope: WorkspaceScope, title?: string): WorkbenchWindow => {
    const existing = activeWindowInScope(current(), scope);
    if (existing !== null) {
      revealWindow(existing.id);
      return existing;
    }
    const window: WorkbenchWindow = {
      id: createId("window"),
      scope,
      title: title?.trim() || (scope.kind === "machine" ? "Machine" : "Workspace"),
      layout: null,
      activePaneId: null,
    };
    options.state.dispatch({ kind: "open-window", window });
    return window;
  };

  const createWindow = (scope: WorkspaceScope, title?: string): WorkbenchWindowId => {
    const window: WorkbenchWindow = {
      id: createId("window"),
      scope,
      title: title?.trim() || (scope.kind === "machine" ? "Machine" : "Workspace"),
      layout: null,
      activePaneId: null,
    };
    options.state.dispatch({ kind: "open-window", window });
    return window.id;
  };

  const selectScope = (scope: WorkspaceScope, windowTitle?: string): WorkbenchWindowId => {
    options.state.dispatch({ kind: "select-scope", scope });
    return ensureWindow(scope, windowTitle).id;
  };

  const openPane = (input: OpenPaneInput): WorkbenchPaneId => {
    const window = ensureWindow(input.pane.scope, input.windowTitle);
    options.state.dispatch({
      kind: "open-pane",
      windowId: window.id,
      pane: input.pane,
      ...(input.targetPaneId === undefined ? {} : { targetPaneId: input.targetPaneId }),
      ...(input.side === undefined ? {} : { side: input.side }),
    });
    return input.pane.id;
  };

  const revealAgent = (input: RevealAgentInput): WorkbenchPaneId => {
    const requested = createAgentPaneDescriptor({
      id: createId("pane"),
      scope: input.scope,
      target: input.target,
      title: input.title,
    });
    const existing = matchingAgentPane(current(), requested);
    if (existing !== null) return revealPane(existing.id);
    return openPane({
      pane: requested,
      ...(input.windowTitle === undefined ? {} : { windowTitle: input.windowTitle }),
      ...(input.targetPaneId === undefined ? {} : { targetPaneId: input.targetPaneId }),
      ...(input.side === undefined ? {} : { side: input.side }),
    });
  };

  const promoteDraft = (input: {
    readonly environmentId: EnvironmentId;
    readonly draftId: string;
    readonly threadId: ThreadId;
    readonly title: string;
  }): WorkbenchPaneId | null => {
    const drafts = Object.values(current().panes).filter(
      (pane): pane is AgentPaneDescriptor =>
        pane?.kind === "agent" &&
        pane.scope.environmentId === input.environmentId &&
        pane.target.kind === "draft" &&
        pane.target.draftId === input.draftId,
    );
    let survivingPaneId: WorkbenchPaneId | null = null;
    for (const draft of drafts) {
      options.state.dispatch({
        kind: "replace-pane",
        paneId: draft.id,
        pane: createAgentPaneDescriptor({
          id: draft.id,
          scope: draft.scope,
          target: { kind: "thread", threadId: input.threadId },
          title: input.title,
        }),
      });
      if (current().panes[draft.id] !== undefined) survivingPaneId = draft.id;
    }
    const canonical = Object.values(current().panes).find(
      (pane): pane is AgentPaneDescriptor =>
        pane?.kind === "agent" &&
        pane.scope.environmentId === input.environmentId &&
        pane.target.kind === "thread" &&
        pane.target.threadId === input.threadId,
    );
    return canonical?.id ?? survivingPaneId;
  };

  return {
    selectScope,
    createWindow,
    revealWindow,
    revealPane,
    revealAgent,
    openPane,
    promoteDraft,
    activeWindow: () => activeWindow(current()),
  };
}
