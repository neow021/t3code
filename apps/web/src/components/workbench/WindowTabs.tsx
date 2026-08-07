import { PanelsTopLeft, Plus, X } from "lucide-react";

import { cn } from "~/lib/utils";
import type { WorkbenchWindow, WorkbenchWindowId } from "~/workbench/model";

export function WindowTabs(props: {
  readonly windows: ReadonlyArray<WorkbenchWindow>;
  readonly activeWindowId: WorkbenchWindowId | null;
  readonly onActivate: (windowId: WorkbenchWindowId) => void;
  readonly onClose: (windowId: WorkbenchWindowId) => void;
  readonly onCreate: () => void;
  readonly onCreatePane: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 border-b bg-muted/10">
      <div
        className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-2 pt-1"
        role="tablist"
        aria-label="Window tabs"
      >
        {props.windows.map((window) => {
          const active = window.id === props.activeWindowId;
          return (
            <div
              key={window.id}
              className={cn(
                "group flex h-8 min-w-28 max-w-56 shrink-0 items-center rounded-t-md border border-b-0 pl-2 pr-1",
                active ? "bg-background text-foreground" : "bg-muted/20 text-muted-foreground",
              )}
              role="presentation"
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                onClick={() => props.onActivate(window.id)}
              >
                {window.title}
              </button>
              <button
                type="button"
                className="ml-1 flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                aria-label={`Close ${window.title}`}
                onClick={() => props.onClose(window.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="hidden w-11 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-muted hover:text-foreground md:flex"
        aria-label="Add Pane"
        onClick={props.onCreatePane}
      >
        <PanelsTopLeft className="size-4" />
      </button>
      <button
        type="button"
        className="flex w-11 shrink-0 items-center justify-center border-l text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Create Window"
        onClick={props.onCreate}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
