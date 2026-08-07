import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  activeWindow,
  agentPaneReuseKey,
  applyWorkbenchCommand,
  createAgentPaneDescriptor,
  createRepositoryKey,
  createWorktreeScope,
  emptyWorkbenchState,
  machineScope,
  paneIdsInLayout,
  scopeKey,
  WorkbenchInvariantError,
  type PaneDescriptor,
  type WorkbenchState,
  type WorkbenchWindow,
  type WorkspaceScope,
} from "./model";

const environmentA = "env-a" as EnvironmentId;
const environmentB = "env-b" as EnvironmentId;
const projectA = "project-a" as ProjectId;
const repositoryA = createRepositoryKey({
  environmentId: environmentA,
  gitCommonDirectory: "/repo/.git",
});

const machineA = machineScope(environmentA);
const worktreeScope = (path: string): WorkspaceScope =>
  createWorktreeScope({
    environmentId: environmentA,
    repositoryKey: repositoryA,
    canonicalWorktreePath: path,
  });

function emptyWindow(id: string, scope: WorkspaceScope = machineA): WorkbenchWindow {
  return { id, scope, title: id, layout: null, activePaneId: null };
}

function terminalPane(
  id: string,
  scope: WorkspaceScope = machineA,
): Extract<PaneDescriptor, { kind: "terminal" }> {
  return {
    id,
    kind: "terminal",
    scope,
    title: id,
    terminalId: `terminal-${id}`,
  };
}

function agentThreadPane(
  id: string,
  threadId: string,
  scope: WorkspaceScope = machineA,
): Extract<PaneDescriptor, { kind: "agent" }> {
  return createAgentPaneDescriptor({
    id,
    scope,
    title: id,
    target: { kind: "thread", threadId: threadId as ThreadId },
  });
}

function agentDraftPane(
  id: string,
  draftId: string,
  scope: WorkspaceScope = machineA,
): Extract<PaneDescriptor, { kind: "agent" }> {
  return createAgentPaneDescriptor({
    id,
    scope,
    title: id,
    target: { kind: "draft", draftId },
  });
}

function openWindow(state: WorkbenchState, window: WorkbenchWindow): WorkbenchState {
  return applyWorkbenchCommand(state, { kind: "open-window", window });
}

function openPane(state: WorkbenchState, windowId: string, pane: PaneDescriptor): WorkbenchState {
  return applyWorkbenchCommand(state, { kind: "open-pane", windowId, pane });
}

describe("workbench model v2", () => {
  it("derives physical scope identity without projectId or access method", () => {
    expect(repositoryA).toBe("repository:env-a:%2Frepo%2F.git");
    expect(scopeKey(machineA)).toBe("machine:env-a");
    expect(scopeKey(worktreeScope("/repo/worktrees/feat:auth"))).toBe(
      "worktree:env-a:repository%3Aenv-a%3A%252Frepo%252F.git:%2Frepo%2Fworktrees%2Ffeat%3Aauth",
    );
  });

  it("keeps opaque pane ids separate from canonical agent reuse keys", () => {
    const first = agentThreadPane("opaque-one", "thread:1");
    const second = agentThreadPane("opaque-two", "thread:1");
    const draft = agentDraftPane("opaque-draft", "draft:1");

    expect(first.id).toBe("opaque-one");
    expect(agentPaneReuseKey(first)).toBe("agent:env-a:thread%3A1");
    expect(agentPaneReuseKey(second)).toBe(agentPaneReuseKey(first));
    expect(agentPaneReuseKey(draft)).toBeNull();
  });

  it("owns independent ordered windows per scope", () => {
    const authScope = worktreeScope("/repo/auth");
    let state = openWindow(emptyWorkbenchState(), emptyWindow("machine", machineA));
    state = openWindow(state, emptyWindow("auth", authScope));

    expect(state.windowsByScope[scopeKey(machineA)]?.map((window) => window.id)).toEqual([
      "machine",
    ]);
    expect(state.windowsByScope[scopeKey(authScope)]?.map((window) => window.id)).toEqual(["auth"]);
    expect(activeWindow(state)?.id).toBe("auth");

    state = applyWorkbenchCommand(state, { kind: "activate-window", windowId: "machine" });
    expect(state.activeScope).toEqual(machineA);
    expect(activeWindow(state)?.id).toBe("machine");
  });

  it("inserts, activates, and removes panes through one layout seam", () => {
    let state = openWindow(emptyWorkbenchState(), emptyWindow("window"));
    state = openPane(state, "window", terminalPane("terminal"));
    state = applyWorkbenchCommand(state, {
      kind: "open-pane",
      windowId: "window",
      pane: {
        id: "files",
        kind: "files",
        scope: machineA,
        title: "Files",
        projectId: projectA,
        rootPath: "/repo",
      },
      targetPaneId: "terminal",
      side: "left",
    });

    expect(activeWindow(state)).toMatchObject({
      activePaneId: "files",
      layout: {
        type: "split",
        direction: "vertical",
        first: { type: "leaf", paneId: "files" },
        second: { type: "leaf", paneId: "terminal" },
      },
    });

    state = applyWorkbenchCommand(state, { kind: "close-pane", paneId: "files" });
    expect(activeWindow(state)).toMatchObject({
      activePaneId: "terminal",
      layout: { type: "leaf", paneId: "terminal" },
    });
    expect(state.panes.files).toBeUndefined();
  });

  it("reveals the canonical live pane when the same server thread is opened twice", () => {
    const authScope = worktreeScope("/repo/auth");
    const dashboardScope = worktreeScope("/repo/dashboard");
    let state = openWindow(emptyWorkbenchState(), emptyWindow("auth", authScope));
    state = openPane(state, "auth", agentThreadPane("agent-auth", "thread-1", authScope));
    state = openWindow(state, emptyWindow("dashboard", dashboardScope));
    state = applyWorkbenchCommand(state, {
      kind: "open-pane",
      windowId: "dashboard",
      pane: agentThreadPane("duplicate", "thread-1", dashboardScope),
    });

    expect(activeWindow(state)?.id).toBe("auth");
    expect(activeWindow(state)?.activePaneId).toBe("agent-auth");
    expect(state.panes.duplicate).toBeUndefined();
    expect(state.activeScope).toEqual(authScope);
  });

  it("allows separate draft panes and reconciles promotion in favor of the active pane", () => {
    let state = openWindow(emptyWorkbenchState(), emptyWindow("canonical"));
    state = openPane(state, "canonical", agentThreadPane("server-pane", "thread-1"));
    state = openWindow(state, emptyWindow("draft-window"));
    state = openPane(state, "draft-window", agentDraftPane("draft-pane", "draft-1"));

    state = applyWorkbenchCommand(state, {
      kind: "replace-pane",
      paneId: "draft-pane",
      pane: agentThreadPane("draft-pane", "thread-1"),
    });

    expect(state.panes["server-pane"]).toBeUndefined();
    expect(state.panes["draft-pane"]).toMatchObject({
      target: { kind: "thread", threadId: "thread-1" },
    });
    expect(activeWindow(state)?.id).toBe("draft-window");
    expect(activeWindow(state)?.activePaneId).toBe("draft-pane");
  });

  it("validates full scope compatibility instead of only environment", () => {
    const authScope = worktreeScope("/repo/auth");
    const dashboardScope = worktreeScope("/repo/dashboard");
    const state = openWindow(emptyWorkbenchState(), emptyWindow("auth", authScope));

    expect(() =>
      openPane(state, "auth", terminalPane("dashboard-terminal", dashboardScope)),
    ).toThrowError(new WorkbenchInvariantError("Pane scope does not match window scope"));

    expect(() =>
      openPane(state, "auth", terminalPane("remote-terminal", machineScope(environmentB))),
    ).toThrowError(new WorkbenchInvariantError("Pane scope does not match window scope"));
  });

  it("closes the owning window when its last pane closes", () => {
    let state = openWindow(emptyWorkbenchState(), emptyWindow("only"));
    state = openPane(state, "only", terminalPane("terminal"));
    state = applyWorkbenchCommand(state, { kind: "close-pane", paneId: "terminal" });

    expect(state.windowsByScope[scopeKey(machineA)]).toBeUndefined();
    expect(state.activeWindowByScope[scopeKey(machineA)]).toBeUndefined();
    expect(state.panes.terminal).toBeUndefined();
    expect(state.activeScope).toEqual(machineA);
  });

  it("moves panes between compatible windows and closes an emptied source", () => {
    let state = openWindow(emptyWorkbenchState(), emptyWindow("source"));
    state = openPane(state, "source", terminalPane("terminal"));
    state = openWindow(state, emptyWindow("target"));
    state = openPane(state, "target", terminalPane("files-shell"));

    state = applyWorkbenchCommand(state, {
      kind: "move-pane",
      paneId: "terminal",
      targetWindowId: "target",
      targetPaneId: "files-shell",
      side: "left",
    });

    expect(state.windowsByScope[scopeKey(machineA)]?.map((window) => window.id)).toEqual([
      "target",
    ]);
    expect(paneIdsInLayout(activeWindow(state)?.layout)).toEqual(["terminal", "files-shell"]);
    expect(activeWindow(state)?.activePaneId).toBe("terminal");
  });

  it("renames and reorders windows through model commands", () => {
    let state = openWindow(emptyWorkbenchState(), emptyWindow("first"));
    state = openWindow(state, emptyWindow("second"));
    state = applyWorkbenchCommand(state, {
      kind: "rename-window",
      windowId: "first",
      title: "Auth refactor",
    });
    state = applyWorkbenchCommand(state, {
      kind: "reorder-window",
      windowId: "second",
      toIndex: 0,
    });

    expect(state.windowsByScope[scopeKey(machineA)]?.map(({ id, title }) => [id, title])).toEqual([
      ["second", "second"],
      ["first", "Auth refactor"],
    ]);
  });

  it("persists split sizes at an addressed layout path", () => {
    let state = openWindow(emptyWorkbenchState(), emptyWindow("window"));
    state = openPane(state, "window", terminalPane("first"));
    state = openPane(state, "window", terminalPane("second"));
    state = applyWorkbenchCommand(state, {
      kind: "resize-split",
      windowId: "window",
      path: [],
      firstSize: 3,
      secondSize: 2,
    });

    expect(activeWindow(state)?.layout).toMatchObject({ firstSize: 3, secondSize: 2 });
    expect(paneIdsInLayout(activeWindow(state)?.layout)).toEqual(["first", "second"]);
  });
});
