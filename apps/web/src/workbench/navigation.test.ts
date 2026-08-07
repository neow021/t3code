import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  applyWorkbenchCommand,
  createRepositoryKey,
  createWorktreeScope,
  emptyWorkbenchState,
  machineScope,
  scopeKey,
  type WorkbenchCommand,
  type WorkbenchState,
} from "./model";
import { createWorkbenchNavigation } from "./navigation";
import { revealDraftRoute, revealThreadRoute, upstreamThreadSharePath } from "./routeAdapter";

const ENVIRONMENT = "env-a" as EnvironmentId;
const THREAD = "thread-a" as ThreadId;
const MACHINE_SCOPE = machineScope(ENVIRONMENT);
const REPOSITORY = createRepositoryKey({
  environmentId: ENVIRONMENT,
  gitCommonDirectory: "/repo/.git",
});
const WORKTREE_SCOPE = createWorktreeScope({
  environmentId: ENVIRONMENT,
  repositoryKey: REPOSITORY,
  canonicalWorktreePath: "/repo",
});

function harness() {
  let state = emptyWorkbenchState();
  let nextId = 0;
  const commands: WorkbenchCommand[] = [];
  const navigation = createWorkbenchNavigation({
    state: {
      getState: () => state,
      dispatch: (command) => {
        commands.push(command);
        state = applyWorkbenchCommand(state, command);
      },
    },
    createId: (kind) => `${kind}-${++nextId}`,
  });
  return {
    navigation,
    commands,
    state: (): WorkbenchState => state,
  };
}

describe("Workbench navigation", () => {
  it("restores a Scope's active Window and creates a launcher only once", () => {
    const test = harness();

    const first = test.navigation.selectScope(MACHINE_SCOPE, "Machine tools");
    const second = test.navigation.selectScope(MACHINE_SCOPE, "Ignored duplicate");

    expect(second).toBe(first);
    expect(test.state().windowsByScope[scopeKey(MACHINE_SCOPE)]).toHaveLength(1);
    expect(test.navigation.activeWindow()?.title).toBe("Machine tools");
  });

  it("creates multiple Windows at Machine scope only when explicitly requested", () => {
    const test = harness();
    const first = test.navigation.createWindow(MACHINE_SCOPE, "Scratch");
    const second = test.navigation.createWindow(MACHINE_SCOPE, "Monitoring");

    expect(second).not.toBe(first);
    expect(
      test.state().windowsByScope[scopeKey(MACHINE_SCOPE)]?.map((window) => window.title),
    ).toEqual(["Scratch", "Monitoring"]);
    expect(test.navigation.activeWindow()?.id).toBe(second);
  });

  it("reveals one canonical server Agent Pane across routes and Scopes", () => {
    const test = harness();
    const fromRoute = revealThreadRoute(test.navigation, {
      environmentId: ENVIRONMENT,
      threadId: THREAD,
      title: "Auth refactor",
      scope: WORKTREE_SCOPE,
    });
    const fromSearch = test.navigation.revealAgent({
      scope: MACHINE_SCOPE,
      target: { kind: "thread", threadId: THREAD },
      title: "Same thread from search",
    });

    expect(fromSearch).toBe(fromRoute);
    expect(Object.values(test.state().panes).filter(Boolean)).toHaveLength(1);
    expect(test.state().activeScope).toEqual(WORKTREE_SCOPE);
    expect(test.navigation.activeWindow()?.activePaneId).toBe(fromRoute);
  });

  it("reuses a draft route but keeps draft identity non-canonical in the model", () => {
    const test = harness();

    const first = revealDraftRoute(test.navigation, {
      environmentId: ENVIRONMENT,
      draftId: "draft-a",
    });
    const second = revealDraftRoute(test.navigation, {
      environmentId: ENVIRONMENT,
      draftId: "draft-a",
    });

    expect(second).toBe(first);
    expect(Object.values(test.state().panes).filter(Boolean)).toHaveLength(1);
  });

  it("promotes a draft in place and reconciles an existing canonical thread", () => {
    const test = harness();
    const canonical = revealThreadRoute(test.navigation, {
      environmentId: ENVIRONMENT,
      threadId: THREAD,
      title: "Server thread",
    });
    test.navigation.selectScope(WORKTREE_SCOPE);
    const draft = revealDraftRoute(test.navigation, {
      environmentId: ENVIRONMENT,
      draftId: "draft-a",
      scope: WORKTREE_SCOPE,
    });

    const promoted = test.navigation.promoteDraft({
      environmentId: ENVIRONMENT,
      draftId: "draft-a",
      threadId: THREAD,
      title: "Promoted thread",
    });

    expect(promoted).toBe(draft);
    expect(test.state().panes[canonical]).toBeUndefined();
    expect(test.state().panes[draft]).toMatchObject({
      target: { kind: "thread", threadId: THREAD },
      title: "Promoted thread",
    });
  });

  it("keeps explicit upstream-compatible share URLs separate from focus commands", () => {
    const test = harness();
    revealThreadRoute(test.navigation, {
      environmentId: ENVIRONMENT,
      threadId: THREAD,
      title: "Thread",
    });

    expect(upstreamThreadSharePath({ environmentId: ENVIRONMENT, threadId: THREAD })).toBe(
      "/env-a/thread-a",
    );
    expect(test.commands.some((command) => command.kind === "activate-pane")).toBe(false);
  });
});
