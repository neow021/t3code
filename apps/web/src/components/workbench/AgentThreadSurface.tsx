import type { ThreadSyncPhase } from "~/threadSync";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import type { AgentPaneDescriptor } from "~/workbench/model";

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
  if (!threadId) return null;

  const shared = {
    environmentId: pane.scope.environmentId,
    threadId,
    ...(onDiffPanelOpen ? { onDiffPanelOpen } : {}),
    ...(reserveTitleBarControlInset === undefined ? {} : { reserveTitleBarControlInset }),
    ...(forceExpandedMobileComposer === undefined ? {} : { forceExpandedMobileComposer }),
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
