import type { PaneDescriptor } from "~/workbench/model";

export function UnavailablePane({ pane }: { readonly pane: PaneDescriptor }) {
  return (
    <div className="flex size-full items-center justify-center bg-background p-6 text-center">
      <div>
        <p className="text-sm font-medium">{pane.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This Pane is unavailable on the current client or Machine. Its layout is preserved.
        </p>
      </div>
    </div>
  );
}
