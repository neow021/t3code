import type { ThreadSyncPhase } from "~/threadSync";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import type { AgentPaneDescriptor } from "~/workbench/model";
import { useMemo } from "react";
import { useProject, useThread } from "~/state/entities";
import { workbenchNavigation } from "~/workbench/store";
import { useFilesPaneRuntimeStore } from "~/workbench/filesPaneRuntimeStore";
import { useTerminalPaneRuntimeStore } from "~/workbench/terminalPaneRuntimeStore";

import ChatView from "../ChatView";

type AgentThreadSurfaceProps = {
  pane: AgentPaneDescriptor;
  threadSyncPhase?: ThreadSyncPhase | null;
  onDiffPanelOpen?: () => void;
  reserveTitleBarControlInset?: boolean;
  forceExpandedMobileComposer?: boolean;
};

/**
 * Workbench adapter for the existing agent runtime.
 *
 * Pane ownership and identity stop here; ChatView remains the legacy runtime
 * implementation until its terminal, diff, files, and preview tenants move to
 * peer PaneDescriptor renderers.
 */
export function AgentThreadSurface(props: AgentThreadSurfaceProps) {
  const {
    pane,
    threadSyncPhase,
    onDiffPanelOpen,
    reserveTitleBarControlInset,
    forceExpandedMobileComposer,
  } = props;
  const draftId = pane.target.kind === "draft" ? DraftId.make(pane.target.draftId) : null;
  const draftThreadId = useComposerDraftStore((store) =>
    draftId ? (store.getDraftSession(draftId)?.threadId ?? null) : null,
  );
  const threadId = pane.target.kind === "thread" ? pane.target.threadId : draftThreadId;
  const threadRef = useMemo(
    () => (threadId ? { environmentId: pane.scope.environmentId, threadId } : null),
    [pane.scope.environmentId, threadId],
  );
  const serverThread = useThread(threadRef);
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const projectId = serverThread?.projectId ?? draftThread?.projectId ?? null;
  const project = useProject(
    projectId ? { environmentId: pane.scope.environmentId, projectId } : null,
  );
  const openFilesRuntime = useFilesPaneRuntimeStore((state) => state.openFile);
  const requestTerminalLaunch = useTerminalPaneRuntimeStore((state) => state.requestLaunch);
  const workbenchPaneActions = useMemo(
    () => ({
      openDiff: () => {
        if (pane.target.kind !== "thread") return;
        workbenchNavigation.revealDiff({
          scope: pane.scope,
          target: { kind: "thread", threadId: pane.target.threadId },
          title: `${pane.title} · Changes`,
          targetPaneId: pane.id,
          side: "right",
        });
      },
      openFiles: () => {
        if (!projectId || !project) return;
        workbenchNavigation.revealFiles({
          scope: pane.scope,
          projectId,
          rootPath: project.workspaceRoot,
          title: `${project.title} · Files`,
          targetPaneId: pane.id,
          side: "right",
        });
      },
      openFile: (relativePath: string) => {
        if (!projectId || !project) return;
        const filesPaneId = workbenchNavigation.revealFiles({
          scope: pane.scope,
          projectId,
          rootPath: project.workspaceRoot,
          title: `${project.title} · Files`,
          targetPaneId: pane.id,
          side: "right",
        });
        openFilesRuntime(filesPaneId, relativePath);
      },
      openTerminal: () => {
        if (!project) return;
        const worktreePath =
          pane.scope.kind === "worktree" ? pane.scope.canonicalWorktreePath : null;
        const terminalPaneId = workbenchNavigation.revealTerminal({
          scope: pane.scope,
          cwd: worktreePath ?? project.workspaceRoot,
          worktreePath,
          threadId,
          title: `${project.title} · Terminal`,
          targetPaneId: pane.id,
          side: "below",
        });
        requestTerminalLaunch(terminalPaneId);
      },
      openBrowser: (previewId: string) => {
        if (pane.target.kind !== "thread") return;
        workbenchNavigation.revealBrowser({
          scope: pane.scope,
          previewId,
          threadId: pane.target.threadId,
          title: `${pane.title} · Browser`,
          targetPaneId: pane.id,
          side: "right",
        });
      },
    }),
    [openFilesRuntime, pane, project, projectId, requestTerminalLaunch, threadId],
  );

  if (!threadId) return null;

  const shared = {
    environmentId: pane.scope.environmentId,
    threadId,
    ...(onDiffPanelOpen ? { onDiffPanelOpen } : {}),
    ...(reserveTitleBarControlInset === undefined ? {} : { reserveTitleBarControlInset }),
    ...(forceExpandedMobileComposer === undefined ? {} : { forceExpandedMobileComposer }),
    compositionMode: "workbench" as const,
    workbenchPaneActions,
  };

  if (draftId) {
    return <ChatView {...shared} routeKind="draft" draftId={draftId} />;
  }

  return (
    <ChatView
      {...shared}
      routeKind="server"
      {...(threadSyncPhase === undefined ? {} : { threadSyncPhase })}
    />
  );
}
