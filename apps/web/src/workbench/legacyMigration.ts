import type {
  EnvironmentId,
  ProjectId,
  ScopedThreadRef,
  VcsListWorktreesResult,
} from "@t3tools/contracts";

import type { RightPanelSurface, ThreadRightPanelState } from "~/rightPanelStore";

import { useFilesPaneRuntimeStore } from "./filesPaneRuntimeStore";
import {
  createRepositoryKey,
  createWorktreeScope,
  machineScope,
  type AgentTarget,
  type WorkspaceScope,
} from "./model";
import type { WorkbenchNavigation } from "./routeAdapter";

export interface LegacyTerminalSnapshot {
  readonly terminalOpen: boolean;
  readonly activeTerminalId: string;
  readonly terminalIds: ReadonlyArray<string>;
}

export interface LegacyProjectSnapshot {
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function pathContains(parent: string, child: string): boolean {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

export function resolveLegacyWorkbenchScope(input: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly inventory: VcsListWorktreesResult | null;
}): WorkspaceScope {
  const inventory = input.inventory;
  if (!inventory?.isRepo || inventory.gitCommonDirectory === null) {
    return machineScope(input.environmentId);
  }
  const worktree = [...inventory.worktrees]
    .filter((candidate) => pathContains(candidate.path, input.workspaceRoot))
    .sort((left, right) => normalizePath(right.path).length - normalizePath(left.path).length)[0];
  if (!worktree) return machineScope(input.environmentId);
  const repositoryKey = createRepositoryKey({
    environmentId: input.environmentId,
    gitCommonDirectory: inventory.gitCommonDirectory,
  });
  return createWorktreeScope({
    environmentId: input.environmentId,
    repositoryKey,
    canonicalWorktreePath: worktree.path,
  });
}

export function legacyAgentImportMarker(input: {
  readonly environmentId: EnvironmentId;
  readonly target: AgentTarget;
}): string {
  const target =
    input.target.kind === "thread"
      ? `thread:${encodeURIComponent(input.target.threadId)}`
      : `draft:${encodeURIComponent(input.target.draftId)}`;
  return `legacy-agent:${encodeURIComponent(input.environmentId)}:${target}`;
}

function activeSurface(state: ThreadRightPanelState): RightPanelSurface | null {
  if (!state.isOpen || state.activeSurfaceId === null) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}

/**
 * One-way ownership transfer for the currently visible legacy composition.
 * Runtime stores remain untouched; only durable placement is written to Workbench v2.
 */
export function migrateVisibleLegacyComposition(input: {
  readonly navigation: WorkbenchNavigation;
  readonly scope: WorkspaceScope;
  readonly target: AgentTarget;
  readonly title: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly project: LegacyProjectSnapshot | null;
  readonly rightPanel: ThreadRightPanelState;
  readonly terminal: LegacyTerminalSnapshot;
}): string {
  const markerKey = legacyAgentImportMarker({
    environmentId: input.scope.environmentId,
    target: input.target,
  });
  if (input.navigation.wasLegacyImported(markerKey)) {
    return (
      input.navigation.findAgent({
        scope: input.scope,
        target: input.target,
        title: input.title,
      }) ??
      input.navigation.revealAgent({
        scope: input.scope,
        target: input.target,
        title: input.title,
      })
    );
  }
  const agentPaneId = input.navigation.revealAgent({
    scope: input.scope,
    target: input.target,
    title: input.title,
  });
  const effectiveScope = input.navigation.pane(agentPaneId)?.scope ?? input.scope;

  const visibleSurface = activeSurface(input.rightPanel);
  let visiblePaneId: string | null = null;
  if (visibleSurface?.kind === "diff" && input.target.kind === "thread") {
    visiblePaneId = input.navigation.revealDiff({
      scope: effectiveScope,
      target: { kind: "thread", threadId: input.target.threadId },
      targetPaneId: agentPaneId,
      side: "right",
    });
  } else if (
    (visibleSurface?.kind === "files" || visibleSurface?.kind === "file") &&
    input.project !== null
  ) {
    visiblePaneId = input.navigation.revealFiles({
      scope: effectiveScope,
      projectId: input.project.id,
      rootPath: input.project.workspaceRoot,
      title: `${input.project.title} · Files`,
      targetPaneId: agentPaneId,
      side: "right",
    });
    if (visibleSurface.kind === "file") {
      useFilesPaneRuntimeStore
        .getState()
        .openFile(
          visiblePaneId,
          visibleSurface.relativePath,
          visibleSurface.revealLine ?? undefined,
        );
    }
  } else if (
    visibleSurface?.kind === "preview" &&
    visibleSurface.resourceId !== null &&
    input.threadRef !== null
  ) {
    visiblePaneId = input.navigation.revealBrowser({
      scope: effectiveScope,
      previewId: visibleSurface.resourceId,
      threadId: input.threadRef.threadId,
      targetPaneId: agentPaneId,
      side: "right",
    });
  } else if (visibleSurface?.kind === "terminal" && input.threadRef !== null && input.project) {
    visiblePaneId = input.navigation.revealTerminal({
      scope: effectiveScope,
      cwd:
        effectiveScope.kind === "worktree"
          ? effectiveScope.canonicalWorktreePath
          : input.project.workspaceRoot,
      worktreePath:
        effectiveScope.kind === "worktree" ? effectiveScope.canonicalWorktreePath : null,
      threadId: input.threadRef.threadId,
      terminalId: visibleSurface.activeTerminalId,
      targetPaneId: agentPaneId,
      side: "right",
    });
  }

  if (
    input.terminal.terminalOpen &&
    input.terminal.activeTerminalId.length > 0 &&
    input.threadRef !== null &&
    input.project !== null
  ) {
    input.navigation.revealTerminal({
      scope: effectiveScope,
      cwd:
        effectiveScope.kind === "worktree"
          ? effectiveScope.canonicalWorktreePath
          : input.project.workspaceRoot,
      worktreePath:
        effectiveScope.kind === "worktree" ? effectiveScope.canonicalWorktreePath : null,
      threadId: input.threadRef.threadId,
      terminalId: input.terminal.activeTerminalId,
      targetPaneId: agentPaneId,
      side: "below",
    });
  }

  input.navigation.markLegacyImported(markerKey);
  input.navigation.revealPane(visiblePaneId ?? agentPaneId);
  return agentPaneId;
}
