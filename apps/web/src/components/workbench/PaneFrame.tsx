import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { PaneDescriptor } from "~/workbench/model";

export function PaneFrame(props: {
  readonly pane: PaneDescriptor;
  readonly active: boolean;
  readonly children: ReactNode;
  readonly onActivate: () => void;
  readonly onClose: () => void;
}) {
  return (
    <section
      className={cn(
        "flex size-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-background",
        props.active ? "border-primary/70 ring-1 ring-primary/25" : "border-border",
      )}
      onPointerDown={props.onActivate}
      data-pane-id={props.pane.id}
      data-pane-kind={props.pane.kind}
      data-active={props.active || undefined}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/20 px-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{props.pane.title}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {props.pane.kind}
        </span>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Close ${props.pane.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={props.onClose}
        >
          <X className="size-3.5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">{props.children}</div>
    </section>
  );
}
