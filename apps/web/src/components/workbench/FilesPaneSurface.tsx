import { useAtomValue } from "@effect/atom-react";
import { DraftId } from "~/composerDraftStore";
import FilePreviewPanel from "~/components/files/FilePreviewPanel";
import { DiffWorkerPoolProvider } from "~/components/DiffWorkerPoolProvider";
import { useProject } from "~/state/entities";
import { primaryServerAvailableEditorsAtom, primaryServerKeybindingsAtom } from "~/state/server";
import type { PaneDescriptor } from "~/workbench/model";
import {
  selectFilesPaneRuntimeState,
  useFilesPaneRuntimeStore,
} from "~/workbench/filesPaneRuntimeStore";

type FilesPaneDescriptor = Extract<PaneDescriptor, { kind: "files" }>;

export function FilesPaneSurface({ pane }: { readonly pane: FilesPaneDescriptor }) {
  const project = useProject({
    environmentId: pane.scope.environmentId,
    projectId: pane.projectId,
  });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const availableEditors = useAtomValue(primaryServerAvailableEditorsAtom);
  const runtime = useFilesPaneRuntimeStore((state) =>
    selectFilesPaneRuntimeState(state.byPaneId, pane.id),
  );
  const openFile = useFilesPaneRuntimeStore((state) => state.openFile);

  return (
    <DiffWorkerPoolProvider>
      <FilePreviewPanel
        environmentId={pane.scope.environmentId}
        cwd={pane.rootPath}
        projectName={project?.title ?? pane.title}
        relativePath={runtime.relativePath}
        threadRef={null}
        composerDraftTarget={DraftId.make(`workbench-files:${pane.id}`)}
        keybindings={keybindings}
        availableEditors={availableEditors}
        revealLine={runtime.revealLine}
        revealRequestId={runtime.revealRequestId}
        onOpenFile={(relativePath) => openFile(pane.id, relativePath)}
        onPendingChange={() => undefined}
      />
    </DiffWorkerPoolProvider>
  );
}
