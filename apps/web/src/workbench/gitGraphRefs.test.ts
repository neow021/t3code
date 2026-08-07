import type { VcsCommitGraphRef } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildGitGraphRefBadges } from "./gitGraphRefs";

const ref = (
  name: string,
  kind: VcsCommitGraphRef["kind"],
  current = false,
): VcsCommitGraphRef => ({ name, kind, current });

describe("buildGitGraphRefBadges", () => {
  it("uses the node for HEAD and joins a local branch to every matching remote", () => {
    expect(
      buildGitGraphRefBadges([
        ref("HEAD", "head", true),
        ref("main", "branch", true),
        ref("origin/main", "remote"),
        ref("upstream/main", "remote"),
        ref("v1.0.0", "tag"),
      ]),
    ).toEqual([
      {
        type: "branch-group",
        local: ref("main", "branch", true),
        remotes: [
          { ref: ref("origin/main", "remote"), remoteName: "origin" },
          { ref: ref("upstream/main", "remote"), remoteName: "upstream" },
        ],
      },
      { type: "ref", ref: ref("v1.0.0", "tag") },
    ]);
  });

  it("keeps unmatched remote refs visible", () => {
    expect(buildGitGraphRefBadges([ref("origin/feature", "remote")])).toEqual([
      { type: "ref", ref: ref("origin/feature", "remote") },
    ]);
  });
});
