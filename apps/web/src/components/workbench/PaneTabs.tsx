import { Plus, X } from "lucide-react";

import { cn } from "~/lib/utils";
import type { PaneDescriptor, WorkbenchPaneId } from "~/workbench/model";

export function PaneTabs(props: {
  readonly panes: ReadonlyArray<PaneDescriptor>;
  readonly activePaneId: WorkbenchPaneId | null;
  readonly onActivate: (paneId: WorkbenchPaneId) => void;
  readonly onClose: (paneId: WorkbenchPaneId) => void;
  readonly onCreate: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 border-b bg-muted/5 md:hidden">
      <div
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-2 pt-1"
        role="tablist"
        aria-label="Pane tabs"
      >
        {props.panes.map((pane) => {
          const active = pane.id === props.activePaneId;
          return (
            <div
              key={pane.id}
              className={cn(
                "group flex h-8 min-w-28 max-w-48 shrink-0 items-center rounded-t-md border border-b-0 pl-2 pr-1",
                active ? "bg-background text-foreground" : "bg-muted/20 text-muted-foreground",
              )}
              role="presentation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                onClick={() => props.onActivate(pane.id)}
              >
                {pane.title}
              </button>
              <button
                type="button"
                className="ml-1 flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Close ${pane.title}`}
                onClick={() => props.onClose(pane.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="flex w-11 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Add Pane"
        onClick={props.onCreate}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
