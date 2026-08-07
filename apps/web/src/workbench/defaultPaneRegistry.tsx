import { AgentThreadSurface } from "~/components/workbench/AgentThreadSurface";
import { DiffPaneSurface } from "~/components/workbench/DiffPaneSurface";
import { FilesPaneSurface } from "~/components/workbench/FilesPaneSurface";
import { TerminalPaneSurface } from "~/components/workbench/TerminalPaneSurface";
import { BrowserPaneSurface } from "~/components/workbench/BrowserPaneSurface";
import { GitGraphPaneSurface } from "~/components/workbench/GitGraphPaneSurface";

import { PaneRegistry } from "./paneRegistry";

export const defaultPaneRegistry = new PaneRegistry([
  {
    kind: "agent",
    render: ({ pane }) => (pane.kind === "agent" ? <AgentThreadSurface pane={pane} /> : null),
  },
  {
    kind: "terminal",
    render: ({ pane, active }) =>
      pane.kind === "terminal" ? <TerminalPaneSurface pane={pane} active={active} /> : null,
  },
  {
    kind: "files",
    render: ({ pane }) => (pane.kind === "files" ? <FilesPaneSurface pane={pane} /> : null),
  },
  {
    kind: "diff",
    render: ({ pane }) => (pane.kind === "diff" ? <DiffPaneSurface pane={pane} /> : null),
  },
  {
    kind: "git-graph",
    render: ({ pane }) => (pane.kind === "git-graph" ? <GitGraphPaneSurface pane={pane} /> : null),
  },
  {
    kind: "browser",
    render: ({ pane, active }) =>
      pane.kind === "browser" ? <BrowserPaneSurface pane={pane} active={active} /> : null,
  },
]);
