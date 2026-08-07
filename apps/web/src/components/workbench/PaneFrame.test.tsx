import type { EnvironmentId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import type { PaneDescriptor } from "~/workbench/model";

import { PaneFrame } from "./PaneFrame";

const pane: PaneDescriptor = {
  id: "pane-agent",
  kind: "agent",
  scope: { kind: "machine", environmentId: "environment-1" as EnvironmentId },
  target: { kind: "draft", draftId: "draft-1" },
  title: "Agent",
};

describe("PaneFrame", () => {
  it("provides a flex sizing boundary for embedded Pane surfaces", () => {
    const markup = renderToStaticMarkup(
      <PaneFrame pane={pane} active onActivate={vi.fn()} onClose={vi.fn()}>
        <div className="flex-1">Surface</div>
      </PaneFrame>,
    );

    expect(markup).toContain('data-pane-content=""');
    expect(markup).toContain('class="flex min-h-0 flex-1 overflow-hidden"');
    expect(markup).toContain(
      'class="hidden h-9 shrink-0 items-center gap-2 border-b bg-muted/20 px-3 md:flex"',
    );
  });
});
