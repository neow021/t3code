import type { VcsCommitGraphCommit } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { layoutGitCommitGraph } from "./gitGraphLayout";

function commit(sha: string, parents: ReadonlyArray<string>): VcsCommitGraphCommit {
  return {
    sha,
    shortSha: sha,
    parents,
    subject: sha,
    body: sha,
    authorName: "Neo",
    authorEmail: "neo@example.com",
    committedAt: "2026-08-06T12:00:00-07:00",
    refs: [],
  };
}

describe("layoutGitCommitGraph", () => {
  it("keeps linear history in one lane", () => {
    const rows = layoutGitCommitGraph([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])]);

    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.edges)).toEqual([
      [{ fromLane: 0, toLane: 0 }],
      [{ fromLane: 0, toLane: 0 }],
      [],
    ]);
  });

  it("allocates and rejoins a merge lane deterministically", () => {
    const rows = layoutGitCommitGraph([
      commit("merge", ["main", "feature"]),
      commit("feature", ["base"]),
      commit("main", ["base"]),
      commit("base", []),
    ]);

    expect(rows[0]?.edges).toEqual([
      { fromLane: 0, toLane: 0 },
      { fromLane: 0, toLane: 1 },
    ]);
    expect(rows[1]?.lane).toBe(1);
    expect(rows[2]?.lane).toBe(0);
    expect(rows[2]?.edges).toEqual([{ fromLane: 0, toLane: 1 }]);
    expect(rows[3]?.lane).toBe(1);
  });
});
