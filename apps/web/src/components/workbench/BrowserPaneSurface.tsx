import type { PaneDescriptor } from "~/workbench/model";
import { PreviewPanel } from "~/components/preview/PreviewPanel";

type BrowserPaneDescriptor = Extract<PaneDescriptor, { kind: "browser" }>;

export function BrowserPaneSurface(props: {
  readonly pane: BrowserPaneDescriptor;
  readonly active: boolean;
}) {
  const { pane, active } = props;
  if (pane.threadId === null) {
    return (
      <div className="flex size-full items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium">Browser session needs an Agent context</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open Preview from an Agent Pane to bind a live browser tab to this Pane.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PreviewPanel
      mode="embedded"
      threadRef={{ environmentId: pane.scope.environmentId, threadId: pane.threadId }}
      tabId={pane.previewId}
      visible={active}
    />
  );
}
