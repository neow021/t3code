import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AgentThreadSurface } from "../components/workbench/AgentThreadSurface";
import { threadHasStarted } from "../components/ChatView.logic";
import {
  DraftId,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
} from "../composerDraftStore";
import { SidebarInset } from "../components/ui/sidebar";
import { waitForDraftHeroTransition } from "../components/chat/draftHeroTransition";
import { buildThreadRouteParams } from "../threadRoutes";
import { useThread, useThreadRefs } from "../state/entities";
import { useWorkbenchBetaEnabled } from "../hooks/useSettings";
import { createAgentPaneDescriptor, machineScope } from "../workbench/model";
import { revealDraftRoute } from "../workbench/routeAdapter";
import { workbenchNavigation } from "../workbench/store";

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const workbenchEnabled = useWorkbenchBetaEnabled();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const threadRefs = useThreadRefs();
  const inferredThreadRef = draftSession
    ? (threadRefs.find(
        (ref) =>
          ref.environmentId === draftSession.environmentId &&
          ref.threadId === draftSession.threadId,
      ) ?? null)
    : null;
  const serverThreadRef = draftSession?.promotedTo ?? inferredThreadRef;
  const serverThread = useThread(serverThreadRef);
  const serverThreadStarted = threadHasStarted(serverThread);
  const canonicalThreadRef = serverThreadStarted ? serverThreadRef : null;

  useEffect(() => {
    if (!inferredThreadRef || draftSession?.promotedTo) {
      return;
    }
    markPromotedDraftThreadByRef(inferredThreadRef);
  }, [draftSession?.promotedTo, inferredThreadRef]);

  useEffect(() => {
    if (!canonicalThreadRef) {
      return;
    }

    if (draftSession) {
      workbenchNavigation.promoteDraft({
        environmentId: canonicalThreadRef.environmentId,
        draftId,
        threadId: canonicalThreadRef.threadId,
        title: serverThread?.title ?? "Agent",
      });
    }

    let cancelled = false;
    void waitForDraftHeroTransition().then(() => {
      if (cancelled) {
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(canonicalThreadRef),
        replace: true,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [canonicalThreadRef, draftId, draftSession, navigate, serverThread?.title]);

  useEffect(() => {
    if (!workbenchEnabled || !draftSession) return;
    revealDraftRoute(workbenchNavigation, {
      environmentId: draftSession.environmentId,
      draftId,
    });
  }, [draftId, draftSession, workbenchEnabled]);

  useEffect(() => {
    if (draftSession || canonicalThreadRef) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [canonicalThreadRef, draftSession, navigate]);

  if (!draftSession) {
    return null;
  }

  if (workbenchEnabled) return null;

  const agentPane = createAgentPaneDescriptor({
    id: `route-draft:${encodeURIComponent(draftId)}`,
    scope: machineScope(draftSession.environmentId),
    target: { kind: "draft", draftId },
    title: "New thread",
  });

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <AgentThreadSurface pane={agentPane} forceExpandedMobileComposer />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/draft/$draftId")({
  component: DraftChatThreadRouteView,
});
