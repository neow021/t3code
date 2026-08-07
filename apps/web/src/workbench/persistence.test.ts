import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  WORKBENCH_STATE_VERSION,
  applyWorkbenchCommand,
  createAgentPaneDescriptor,
  createRepositoryKey,
  createWorktreeScope,
  emptyWorkbenchState,
  scopeKey,
  type AgentPaneDescriptor,
  type PaneDescriptor,
  type WorkbenchWindow,
} from "./model";
import { restoreWorkbenchState } from "./persistence";

const environmentA = "env-a" as EnvironmentId;
const scope = createWorktreeScope({
  environmentId: environmentA,
  repositoryKey: createRepositoryKey({
    environmentId: environmentA,
    gitCommonDirectory: "/repo/.git",
  }),
  canonicalWorktreePath: "/repo/auth",
});

function window(id: string): WorkbenchWindow {
  return { id, scope, title: id, layout: null, activePaneId: null };
}

function agent(id: string, target: AgentPaneDescriptor["target"]): PaneDescriptor {
  return createAgentPaneDescriptor({ id, scope, title: id, target });
}

describe("Workbench v2 persistence interface", () => {
  it("round-trips the durable model", () => {
    let state = applyWorkbenchCommand(emptyWorkbenchState(), {
      kind: "open-window",
      window: window("auth"),
    });
    state = applyWorkbenchCommand(state, {
      kind: "open-pane",
      windowId: "auth",
      pane: agent("agent", { kind: "thread", threadId: "thread-1" as ThreadId }),
    });

    const result = restoreWorkbenchState(JSON.parse(JSON.stringify(state)));
    expect(result.quarantine).toBeNull();
    expect(result.repairs).toEqual([]);
    expect(result.state).toEqual(state);
  });

  it("quarantines unknown and v1 persistence versions instead of guessing identity", () => {
    const future = restoreWorkbenchState({ version: 999 });
    expect(future.state).toEqual(emptyWorkbenchState());
    expect(future.quarantine).toMatchObject({ reason: "unsupported-version", version: 999 });

    const v1 = restoreWorkbenchState({ version: 1 });
    expect(v1.state).toEqual(emptyWorkbenchState());
    expect(v1.quarantine).toMatchObject({ reason: "unsupported-version", version: 1 });
  });

  it("repairs invalid ownership, duplicate server agents, active ids, and orphan panes", () => {
    const key = scopeKey(scope);
    const restored = restoreWorkbenchState({
      version: WORKBENCH_STATE_VERSION,
      activeScope: scope,
      windowsByScope: {
        [key]: [
          {
            id: "auth",
            scope,
            title: "Auth",
            activePaneId: "missing",
            layout: {
              type: "split",
              direction: "vertical",
              first: { type: "leaf", paneId: "agent-primary" },
              second: {
                type: "split",
                direction: "horizontal",
                first: { type: "leaf", paneId: "agent-duplicate" },
                second: { type: "leaf", paneId: "cross-scope" },
              },
            },
          },
        ],
      },
      activeWindowByScope: { [key]: "missing-window" },
      panes: {
        "agent-primary": agent("agent-primary", {
          kind: "thread",
          threadId: "thread-1" as ThreadId,
        }),
        "agent-duplicate": agent("agent-duplicate", {
          kind: "thread",
          threadId: "thread-1" as ThreadId,
        }),
        "cross-scope": {
          id: "cross-scope",
          kind: "terminal",
          scope: { kind: "machine", environmentId: environmentA },
          title: "Wrong scope",
          terminalId: "terminal-b",
          threadId: null,
          cwd: "/repo",
          worktreePath: null,
        },
        orphan: {
          id: "orphan",
          kind: "terminal",
          scope,
          title: "Orphan",
          terminalId: "terminal-orphan",
          threadId: null,
          cwd: "/repo",
          worktreePath: "/repo",
        },
      },
    });

    expect(restored.quarantine).toBeNull();
    expect(restored.repairs.length).toBeGreaterThan(0);
    expect(restored.state.windowsByScope[key]).toEqual([
      {
        id: "auth",
        scope,
        title: "Auth",
        layout: { type: "leaf", paneId: "agent-primary" },
        activePaneId: "agent-primary",
      },
    ]);
    expect(restored.state.activeWindowByScope[key]).toBe("auth");
    expect(Object.keys(restored.state.panes)).toEqual(["agent-primary"]);
  });

  it("keeps separate draft panes because only server threads are canonical", () => {
    const key = scopeKey(scope);
    const restored = restoreWorkbenchState({
      version: WORKBENCH_STATE_VERSION,
      activeScope: scope,
      windowsByScope: {
        [key]: [
          {
            id: "auth",
            scope,
            title: "Auth",
            activePaneId: "draft-a",
            layout: {
              type: "split",
              direction: "vertical",
              first: { type: "leaf", paneId: "draft-a" },
              second: { type: "leaf", paneId: "draft-b" },
            },
          },
        ],
      },
      activeWindowByScope: { [key]: "auth" },
      panes: {
        "draft-a": agent("draft-a", { kind: "draft", draftId: "draft-1" }),
        "draft-b": agent("draft-b", { kind: "draft", draftId: "draft-1" }),
      },
    });

    expect(Object.keys(restored.state.panes)).toEqual(["draft-a", "draft-b"]);
  });

  it("drops windows stored under a scope they do not own", () => {
    const restored = restoreWorkbenchState({
      version: WORKBENCH_STATE_VERSION,
      activeScope: null,
      windowsByScope: { "machine:wrong": [window("auth")] },
      activeWindowByScope: {},
      panes: {},
    });

    expect(restored.state.windowsByScope).toEqual({});
    expect(restored.repairs).toContain("dropped-window-with-mismatched-scope");
  });
});
