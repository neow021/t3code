import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AgentThreadSurface } from "../components/workbench/AgentThreadSurface";
import { threadHasStarted } from "../components/ChatView.logic";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import { resolveThreadRouteRef, resolveThreadRouteRenderState } from "../threadRoutes";
import { resolveThreadSyncPhase } from "../threadSync";
import { SidebarInset } from "~/components/ui/sidebar";
import {
  useEnvironmentThreadRefs,
  useThreadDetail,
  useThreadShell,
  useThreadStatus,
} from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { useWorkbenchBetaEnabled } from "../hooks/useSettings";
import { environmentShell } from "../state/shell";
import { createAgentPaneDescriptor, machineScope } from "../workbench/model";
import { useLegacyCompositionMigration } from "../workbench/useLegacyCompositionMigration";

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const workbenchEnabled = useWorkbenchBetaEnabled();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const shell = useEnvironmentQuery(
    threadRef === null ? null : environmentShell.stateAtom(threadRef.environmentId),
  );
  const serverThreadShell = useThreadShell(threadRef);
  const serverThreadDetail = useThreadDetail(threadRef);
  const serverThreadStatus = useThreadStatus(threadRef);
  const environmentThreadRefs = useEnvironmentThreadRefs(threadRef?.environmentId ?? null);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const environmentHasServerThreads = environmentThreadRefs.length > 0;
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadShellExists: serverThreadShell !== null,
    serverThreadDetailExists: serverThreadDetail !== null,
    serverThreadDetailDeleted: serverThreadStatus === "deleted",
    draftThreadExists,
  });
  const threadSyncPhase = resolveThreadSyncPhase({
    detailExists: serverThreadDetail !== null,
    shellExists: serverThreadShell !== null,
    status: serverThreadStatus,
  });
  const serverThreadStarted = threadHasStarted(serverThreadDetail);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  useLegacyCompositionMigration({
    enabled: workbenchEnabled && renderState !== "missing",
    environmentId: threadRef?.environmentId ?? null,
    target: threadRef ? { kind: "thread", threadId: threadRef.threadId } : null,
    title: serverThreadShell?.title ?? "Agent",
    threadRef,
    projectId: serverThreadDetail?.projectId ?? draftThread?.projectId ?? null,
  });

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    if (renderState === "missing" && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, renderState, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread, serverThreadStarted, threadRef]);

  if (!threadRef) {
    return null;
  }

  if (workbenchEnabled) return null;

  const agentPane = createAgentPaneDescriptor({
    id: `route-agent:${encodeURIComponent(threadRef.environmentId)}:${encodeURIComponent(threadRef.threadId)}`,
    scope: machineScope(threadRef.environmentId),
    target: { kind: "thread", threadId: threadRef.threadId },
    title: serverThreadShell?.title ?? "Agent",
  });

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      {renderState === "ready" || (renderState === "loading" && serverThreadShell !== null) ? (
        <AgentThreadSurface pane={agentPane} threadSyncPhase={threadSyncPhase} />
      ) : null}
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  component: ChatThreadRouteView,
});
