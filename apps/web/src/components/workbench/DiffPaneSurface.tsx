import { ThreadId, type ScopedThreadRef } from "@t3tools/contracts";

import DiffPanel, { DiffWorkerPoolProvider } from "~/components/DiffPanel";
import { DraftId } from "~/composerDraftStore";
import type { PaneDescriptor } from "~/workbench/model";

type DiffPaneDescriptor = Extract<PaneDescriptor, { kind: "diff" }>;

function threadRefForPane(pane: DiffPaneDescriptor): ScopedThreadRef | null {
  return pane.target.kind === "thread"
    ? { environmentId: pane.scope.environmentId, threadId: pane.target.threadId }
    : null;
}

export function DiffPaneSurface({ pane }: { readonly pane: DiffPaneDescriptor }) {
  const threadRef = threadRefForPane(pane);
  const selectionRef: ScopedThreadRef = threadRef ?? {
    environmentId: pane.scope.environmentId,
    threadId: ThreadId.make(`workbench-diff:${pane.id}`),
  };
  const target =
    pane.target.kind === "thread"
      ? ({ kind: "thread", threadRef: selectionRef } as const)
      : ({
          kind: "worktree",
          environmentId: pane.scope.environmentId,
          cwd: pane.target.canonicalWorktreePath,
          selectionRef,
        } as const);

  return (
    <DiffWorkerPoolProvider>
      <DiffPanel
        mode="embedded"
        target={target}
        composerDraftTarget={threadRef ?? DraftId.make(`workbench-diff:${pane.id}`)}
        initialGitScope="unstaged"
      />
    </DiffWorkerPoolProvider>
  );
}
