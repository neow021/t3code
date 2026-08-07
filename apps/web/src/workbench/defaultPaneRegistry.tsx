import { lazy, Suspense, type ReactNode } from "react";

import { AgentThreadSurface } from "~/components/workbench/AgentThreadSurface";

import { PaneRegistry } from "./paneRegistry";

const DiffPaneSurface = lazy(() =>
  import("~/components/workbench/DiffPaneSurface").then((module) => ({
    default: module.DiffPaneSurface,
  })),
);
const FilesPaneSurface = lazy(() =>
  import("~/components/workbench/FilesPaneSurface").then((module) => ({
    default: module.FilesPaneSurface,
  })),
);
const TerminalPaneSurface = lazy(() =>
  import("~/components/workbench/TerminalPaneSurface").then((module) => ({
    default: module.TerminalPaneSurface,
  })),
);
const BrowserPaneSurface = lazy(() =>
  import("~/components/workbench/BrowserPaneSurface").then((module) => ({
    default: module.BrowserPaneSurface,
  })),
);
const GitGraphPaneSurface = lazy(() =>
  import("~/components/workbench/GitGraphPaneSurface").then((module) => ({
    default: module.GitGraphPaneSurface,
  })),
);

function LazyPane({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
          Loading Pane…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const defaultPaneRegistry = new PaneRegistry([
  {
    kind: "agent",
    render: ({ pane }) => (pane.kind === "agent" ? <AgentThreadSurface pane={pane} /> : null),
  },
  {
    kind: "terminal",
    render: ({ pane, active }) =>
      pane.kind === "terminal" ? (
        <LazyPane>
          <TerminalPaneSurface pane={pane} active={active} />
        </LazyPane>
      ) : null,
  },
  {
    kind: "files",
    render: ({ pane }) =>
      pane.kind === "files" ? (
        <LazyPane>
          <FilesPaneSurface pane={pane} />
        </LazyPane>
      ) : null,
  },
  {
    kind: "diff",
    render: ({ pane }) =>
      pane.kind === "diff" ? (
        <LazyPane>
          <DiffPaneSurface pane={pane} />
        </LazyPane>
      ) : null,
  },
  {
    kind: "git-graph",
    render: ({ pane }) =>
      pane.kind === "git-graph" ? (
        <LazyPane>
          <GitGraphPaneSurface pane={pane} />
        </LazyPane>
      ) : null,
  },
  {
    kind: "browser",
    render: ({ pane, active }) =>
      pane.kind === "browser" ? (
        <LazyPane>
          <BrowserPaneSurface pane={pane} active={active} />
        </LazyPane>
      ) : null,
  },
]);
