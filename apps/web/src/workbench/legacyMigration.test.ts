import type {
  EnvironmentId,
  ProjectId,
  ThreadId,
  VcsListWorktreesResult,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import {
  applyWorkbenchCommand,
  emptyWorkbenchState,
  paneIdsInLayout,
  type WorkbenchCommand,
  type WorkbenchState,
} from "./model";
import {
  legacyAgentImportMarker,
  migrateVisibleLegacyComposition,
  resolveLegacyWorkbenchScope,
} from "./legacyMigration";
import { createWorkbenchNavigation } from "./navigation";

const ENVIRONMENT = "env-a" as EnvironmentId;
const THREAD = "thread-a" as ThreadId;

function inventory(): VcsListWorktreesResult {
  return {
    isRepo: true,
    repositoryRoot: "/repo",
    gitCommonDirectory: "/repo/.git",
    worktrees: [
      {
        path: "/repo",
        headSha: "aaaaaaaa",
        branchRef: "refs/heads/main",
        detached: false,
        bare: false,
        locked: false,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      },
      {
        path: "/repo/nested",
        headSha: "bbbbbbbb",
        branchRef: "refs/heads/feature",
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
      observedAt: DateTime.makeUnsafe("2026-08-06T19:00:00.000Z"),
      expiresAt: Option.none(),
    },
  };
}

function harness() {
  let state = emptyWorkbenchState();
  let nextId = 0;
  const navigation = createWorkbenchNavigation({
    state: {
      getState: () => state,
      dispatch: (command: WorkbenchCommand) => {
        state = applyWorkbenchCommand(state, command);
      },
    },
    createId: (kind) => `${kind}-${++nextId}`,
  });
  return { navigation, state: (): WorkbenchState => state };
}

describe("legacy Workbench composition migration", () => {
  it("resolves the deepest authoritative physical Worktree", () => {
    const scope = resolveLegacyWorkbenchScope({
      environmentId: ENVIRONMENT,
      workspaceRoot: "/repo/nested/packages/web",
      inventory: inventory(),
    });

    expect(scope).toMatchObject({
      kind: "worktree",
      environmentId: ENVIRONMENT,
      canonicalWorktreePath: "/repo/nested",
    });
  });

  it("imports only visible peers once while retaining terminal runtime identity", () => {
    const test = harness();
    const scope = resolveLegacyWorkbenchScope({
      environmentId: ENVIRONMENT,
      workspaceRoot: "/repo/packages/web",
      inventory: inventory(),
    });
    const input = {
      navigation: test.navigation,
      scope,
      target: { kind: "thread" as const, threadId: THREAD },
      title: "Auth refactor",
      threadRef: { environmentId: ENVIRONMENT, threadId: THREAD },
      project: {
        id: "project-a" as ProjectId,
        title: "Web",
        workspaceRoot: "/repo/packages/web",
      },
      rightPanel: {
        isOpen: true,
        activeSurfaceId: "diff",
        surfaces: [{ id: "diff" as const, kind: "diff" as const }],
      },
      terminal: {
        terminalOpen: true,
        activeTerminalId: "term-2",
        terminalIds: ["term-1", "term-2"],
      },
    };

    const agentPaneId = migrateVisibleLegacyComposition(input);
    migrateVisibleLegacyComposition(input);

    const panes = Object.values(test.state().panes).filter((pane) => pane !== undefined);
    expect(panes).toHaveLength(3);
    expect(panes.find((pane) => pane.kind === "terminal")).toMatchObject({
      terminalId: "term-2",
      threadId: THREAD,
    });
    expect(test.navigation.activeWindow()?.activePaneId).toBe(
      panes.find((pane) => pane.kind === "diff")?.id,
    );
    expect(paneIdsInLayout(test.navigation.activeWindow()?.layout)).toHaveLength(3);
    expect(
      test.state().legacyImportMarkers[
        legacyAgentImportMarker({ environmentId: ENVIRONMENT, target: input.target })
      ],
    ).toBe(true);
    expect(test.state().panes[agentPaneId]?.kind).toBe("agent");
  });
});
