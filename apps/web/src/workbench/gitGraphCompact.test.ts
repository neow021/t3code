import type { VcsCommitGraphCommit } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildGitGraphDisplayRows } from "./gitGraphCompact";
import { layoutGitCommitGraph } from "./gitGraphLayout";

function commit(
  sha: string,
  parents: ReadonlyArray<string>,
  refs: VcsCommitGraphCommit["refs"] = [],
): VcsCommitGraphCommit {
  return {
    sha,
    shortSha: sha,
    parents,
    refs,
    subject: sha,
    body: sha,
    authorName: "Neo",
    authorEmail: "neo@example.com",
    committedAt: "2026-08-06T12:00:00-07:00",
  };
}

describe("buildGitGraphDisplayRows", () => {
  it("collapses a sufficiently long ordinary linear run", () => {
    const rows = layoutGitCommitGraph([
      commit("tip", ["d"], [{ name: "main", kind: "branch", current: true }]),
      commit("d", ["c"]),
      commit("c", ["b"]),
      commit("b", ["root"]),
      commit("root", []),
    ]);

    const display = buildGitGraphDisplayRows(rows, 3);
    expect(display.map((row) => row.kind)).toEqual(["commit", "segment", "commit"]);
    expect(display[1]).toMatchObject({ kind: "segment", lane: 0 });
    if (display[1]?.kind === "segment") expect(display[1].rows).toHaveLength(3);
  });

  it("never collapses ref or merge boundaries", () => {
    const rows = layoutGitCommitGraph([
      commit("merge", ["main", "feature"], [{ name: "main", kind: "branch", current: true }]),
      commit("feature", ["root"], [{ name: "feature", kind: "branch", current: false }]),
      commit("main", ["root"]),
      commit("root", []),
    ]);

    expect(buildGitGraphDisplayRows(rows, 3).every((row) => row.kind === "commit")).toBe(true);
  });
});
