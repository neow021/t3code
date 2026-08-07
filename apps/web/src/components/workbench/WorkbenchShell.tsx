import type { PaneDescriptor } from "~/workbench/model";
import { paneIdsInLayout, scopeKey } from "~/workbench/model";
import { defaultPaneRegistry } from "~/workbench/defaultPaneRegistry";
import type { PaneRegistry } from "~/workbench/paneRegistry";
import { useWorkbenchStore, workbenchNavigation } from "~/workbench/store";

import { CompactPane, PaneTree } from "./PaneTree";
import { PaneLauncher } from "./PaneLauncher";
import { WindowTabs } from "./WindowTabs";

export function WorkbenchShell(props: {
  readonly registry?: PaneRegistry;
  readonly isPaneAvailable?: (pane: PaneDescriptor) => boolean;
}) {
  const activeScope = useWorkbenchStore((state) => state.activeScope);
  const windowsByScope = useWorkbenchStore((state) => state.windowsByScope);
  const activeWindowByScope = useWorkbenchStore((state) => state.activeWindowByScope);
  const panes = useWorkbenchStore((state) => state.panes);
  const dispatch = useWorkbenchStore((state) => state.dispatch);
  const registry = props.registry ?? defaultPaneRegistry;

  if (activeScope === null) {
    return (
      <main className="flex h-dvh min-h-0 min-w-0 flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Select a Machine or Worktree.</p>
      </main>
    );
  }

  const key = scopeKey(activeScope);
  const windows = windowsByScope[key] ?? [];
  const activeWindowId = activeWindowByScope[key] ?? windows[0]?.id ?? null;
  const activeWindow = windows.find((window) => window.id === activeWindowId) ?? windows[0] ?? null;
  const shared =
    activeWindow === null
      ? null
      : {
          panes,
          activePaneId: activeWindow.activePaneId,
          registry,
          onActivate: (paneId: string) => dispatch({ kind: "activate-pane", paneId }),
          onClose: (paneId: string) => dispatch({ kind: "close-pane", paneId }),
          ...(props.isPaneAvailable === undefined
            ? {}
            : { isPaneAvailable: props.isPaneAvailable }),
        };

  return (
    <main className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-background">
      <WindowTabs
        windows={windows}
        activeWindowId={activeWindow?.id ?? null}
        onActivate={(windowId) => dispatch({ kind: "activate-window", windowId })}
        onClose={(windowId) => dispatch({ kind: "close-window", windowId })}
        onCreate={() => workbenchNavigation.createWindow(activeScope)}
      />
      <div className="min-h-0 flex-1 p-1.5">
        {activeWindow?.layout === null || activeWindow === null || shared === null ? (
          <PaneLauncher />
        ) : (
          <>
            <div className="hidden size-full min-h-0 md:block">
              <PaneTree {...shared} node={activeWindow.layout} />
            </div>
            <div className="size-full min-h-0 md:hidden">
              <CompactPane {...shared} />
            </div>
          </>
        )}
      </div>
      {activeWindow?.layout ? (
        <span className="sr-only">{paneIdsInLayout(activeWindow.layout).length} Panes</span>
      ) : null}
    </main>
  );
}
