import { AgentThreadSurface } from "~/components/workbench/AgentThreadSurface";

import { PaneRegistry, type PaneKind } from "./paneRegistry";

function PendingSurface({ kind }: { readonly kind: PaneKind }) {
  return (
    <div className="flex size-full items-center justify-center bg-background p-6 text-center">
      <div>
        <p className="text-sm font-medium capitalize">{kind.replace("-", " ")} Pane</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This surface is available as a Pane type; its upstream runtime adapter is still moving.
        </p>
      </div>
    </div>
  );
}

export const defaultPaneRegistry = new PaneRegistry([
  {
    kind: "agent",
    render: ({ pane }) => (pane.kind === "agent" ? <AgentThreadSurface pane={pane} /> : null),
  },
  { kind: "terminal", render: () => <PendingSurface kind="terminal" /> },
  { kind: "files", render: () => <PendingSurface kind="files" /> },
  { kind: "diff", render: () => <PendingSurface kind="diff" /> },
  { kind: "git-graph", render: () => <PendingSurface kind="git-graph" /> },
  { kind: "browser", render: () => <PendingSurface kind="browser" /> },
]);
