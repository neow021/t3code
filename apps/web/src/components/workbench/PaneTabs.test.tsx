import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { PaneDescriptor } from "~/workbench/model";

import { PaneTabs } from "./PaneTabs";

const environmentId = "environment-1" as EnvironmentId;
const panes: PaneDescriptor[] = [
  {
    id: "pane-agent",
    kind: "agent",
    scope: { kind: "machine", environmentId },
    target: { kind: "draft", draftId: "draft-1" },
    title: "Agent",
  },
  {
    id: "pane-files",
    kind: "files",
    scope: { kind: "machine", environmentId },
    projectId: "project-1" as ProjectId,
    rootPath: "/repo",
    title: "Files",
  },
];

describe("PaneTabs", () => {
  it("renders peer Pane tabs, active state, touch-visible close actions, and Add Pane", () => {
    const markup = renderToStaticMarkup(
      <PaneTabs
        panes={panes}
        activePaneId="pane-files"
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Pane tabs"');
    expect(markup).toContain("Agent");
    expect(markup).toContain("Files");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-label="Close Files"');
    expect(markup).toContain('aria-label="Add Pane"');
    expect(markup).not.toContain("opacity-0");
  });
});
