import { describe, expect, it } from "vite-plus/test";

import { parseGitWorktreePorcelain } from "./GitWorktreePorcelain.ts";

describe("parseGitWorktreePorcelain", () => {
  it("preserves NUL-delimited paths and complete worktree states", () => {
    const parsed = parseGitWorktreePorcelain(
      [
        "worktree /repo/main",
        "HEAD 1111111111111111111111111111111111111111",
        "branch refs/heads/main",
        "",
        "worktree /repo/feature\nwith-newline",
        "HEAD 2222222222222222222222222222222222222222",
        "detached",
        "locked checked out by another process",
        "",
        "worktree /repo/stale",
        "HEAD 3333333333333333333333333333333333333333",
        "branch refs/heads/stale",
        "prunable gitdir file points to non-existent location",
        "",
        "worktree /repo/bare.git",
        "bare",
        "locked",
        "",
      ].join("\0"),
    );

    expect(parsed).toEqual([
      {
        path: "/repo/main",
        headSha: "1111111111111111111111111111111111111111",
        branchRef: "refs/heads/main",
        detached: false,
        bare: false,
        locked: false,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      },
      {
        path: "/repo/feature\nwith-newline",
        headSha: "2222222222222222222222222222222222222222",
        branchRef: null,
        detached: true,
        bare: false,
        locked: true,
        lockedReason: "checked out by another process",
        prunable: false,
        prunableReason: null,
      },
      {
        path: "/repo/stale",
        headSha: "3333333333333333333333333333333333333333",
        branchRef: "refs/heads/stale",
        detached: false,
        bare: false,
        locked: false,
        lockedReason: null,
        prunable: true,
        prunableReason: "gitdir file points to non-existent location",
      },
      {
        path: "/repo/bare.git",
        headSha: null,
        branchRef: null,
        detached: false,
        bare: true,
        locked: true,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      },
    ]);
  });

  it("ignores unknown fields and incomplete records without inventing paths", () => {
    expect(
      parseGitWorktreePorcelain(
        [
          "HEAD deadbeef",
          "branch refs/heads/missing-path",
          "",
          "worktree /repo/main",
          "future-field value",
          "",
        ].join("\0"),
      ),
    ).toEqual([
      {
        path: "/repo/main",
        headSha: null,
        branchRef: null,
        detached: false,
        bare: false,
        locked: false,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      },
    ]);
  });
});
