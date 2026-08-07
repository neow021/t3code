import { Plus, X } from "lucide-react";

import { cn } from "~/lib/utils";
import type { WorkbenchWindow, WorkbenchWindowId } from "~/workbench/model";

export function WindowTabs(props: {
  readonly windows: ReadonlyArray<WorkbenchWindow>;
  readonly activeWindowId: WorkbenchWindowId | null;
  readonly onActivate: (windowId: WorkbenchWindowId) => void;
  readonly onClose: (windowId: WorkbenchWindowId) => void;
  readonly onCreate: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/10 px-2 pt-1">
      {props.windows.map((window) => {
        const active = window.id === props.activeWindowId;
        return (
          <div
            key={window.id}
            className={cn(
              "group flex h-8 min-w-28 max-w-56 items-center rounded-t-md border border-b-0 px-2",
              active ? "bg-background text-foreground" : "bg-muted/20 text-muted-foreground",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium"
              onClick={() => props.onActivate(window.id)}
            >
              {window.title}
            </button>
            <button
              type="button"
              className="ml-1 rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100"
              aria-label={`Close ${window.title}`}
              onClick={() => props.onClose(window.id)}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="mb-1 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Create Window"
        onClick={props.onCreate}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
