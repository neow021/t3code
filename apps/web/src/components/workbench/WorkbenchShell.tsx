import type { PaneDescriptor } from "~/workbench/model";
import { useState } from "react";
import { paneIdsInLayout, scopeKey } from "~/workbench/model";
import { defaultPaneRegistry } from "~/workbench/defaultPaneRegistry";
import type { PaneRegistry } from "~/workbench/paneRegistry";
import {
  clearWorkbenchQuarantine,
  hasWorkbenchQuarantine,
  useWorkbenchStore,
  workbenchNavigation,
} from "~/workbench/store";

import { CompactPane, PaneTree } from "./PaneTree";
import { PaneLauncher } from "./PaneLauncher";
import { PaneTabs } from "./PaneTabs";
import { WindowTabs } from "./WindowTabs";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";

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
  const [quarantineVisible, setQuarantineVisible] = useState(hasWorkbenchQuarantine);
  const [paneLauncherOpen, setPaneLauncherOpen] = useState(false);

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
  const activePanes =
    activeWindow?.layout === null || activeWindow === null
      ? []
      : paneIdsInLayout(activeWindow.layout).flatMap((paneId) => {
          const pane = panes[paneId];
          return pane === undefined ? [] : [pane];
        });

  return (
    <main className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-background">
      <WindowTabs
        windows={windows}
        activeWindowId={activeWindow?.id ?? null}
        onActivate={(windowId) => dispatch({ kind: "activate-window", windowId })}
        onClose={(windowId) => dispatch({ kind: "close-window", windowId })}
        onCreate={() => {
          setPaneLauncherOpen(false);
          workbenchNavigation.createWindow(activeScope);
        }}
        onCreatePane={() => setPaneLauncherOpen(true)}
      />
      {activePanes.length > 0 ? (
        <PaneTabs
          panes={activePanes}
          activePaneId={activeWindow?.activePaneId ?? null}
          onActivate={(paneId) => dispatch({ kind: "activate-pane", paneId })}
          onClose={(paneId) => dispatch({ kind: "close-pane", paneId })}
          onCreate={() => setPaneLauncherOpen(true)}
        />
      ) : null}
      {quarantineVisible ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            An invalid or newer Workbench layout was quarantined. A safe empty layout is active.
          </span>
          <button
            type="button"
            className="rounded border border-amber-500/30 px-2 py-1 font-medium hover:bg-amber-500/10"
            onClick={() => {
              useWorkbenchStore.getState().reset();
              clearWorkbenchQuarantine();
              setQuarantineVisible(false);
            }}
          >
            Reset saved layout
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 p-1.5">
        {activeWindow?.layout === null || activeWindow === null || shared === null ? (
          <PaneLauncher scope={activeScope} />
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
      <Sheet open={paneLauncherOpen} onOpenChange={setPaneLauncherOpen}>
        <SheetPopup side="bottom" className="max-h-[85dvh] rounded-t-xl" aria-label="Add Pane">
          <SheetTitle className="sr-only">Add Pane</SheetTitle>
          <PaneLauncher scope={activeScope} onOpened={() => setPaneLauncherOpen(false)} />
        </SheetPopup>
      </Sheet>
    </main>
  );
}
