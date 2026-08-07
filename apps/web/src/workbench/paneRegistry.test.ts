import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { machineScope, type PaneDescriptor } from "./model";
import { DEFAULT_PANE_KINDS, PaneRegistry } from "./paneRegistry";

const terminal: PaneDescriptor = {
  id: "terminal-pane",
  kind: "terminal",
  scope: machineScope("env-a" as EnvironmentId),
  title: "Terminal",
  terminalId: "terminal-a",
  threadId: null,
  cwd: "/repo",
  worktreePath: null,
};

describe("PaneRegistry", () => {
  it("renders a surface through its adapter without shell-specific branching", () => {
    const registry = new PaneRegistry([
      { kind: "terminal", render: ({ pane, active }) => `${pane.id}:${active}` },
    ]);

    expect(registry.render(terminal, true)).toBe("terminal-pane:true");
    expect(registry.render({ ...terminal, kind: "terminal" }, false)).toBe("terminal-pane:false");
  });

  it("rejects duplicate adapters", () => {
    expect(
      () =>
        new PaneRegistry([
          { kind: "terminal", render: () => null },
          { kind: "terminal", render: () => null },
        ]),
    ).toThrowError("Duplicate Pane adapter: terminal");
  });

  it("registers Agent, Terminal, Files, Diff, Git Graph, and Browser as peer Pane types", () => {
    expect(DEFAULT_PANE_KINDS).toEqual([
      "agent",
      "terminal",
      "files",
      "diff",
      "git-graph",
      "browser",
    ]);
  });
});
