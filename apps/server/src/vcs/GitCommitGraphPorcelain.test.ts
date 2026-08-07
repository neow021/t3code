import { describe, expect, it } from "vite-plus/test";

import { parseGitCommitGraphLog, parseGitCommitGraphRefs } from "./GitCommitGraphPorcelain.js";

describe("GitCommitGraphPorcelain", () => {
  it("parses topology, metadata, and full ref decorations", () => {
    const stdout = [
      [
        "aaaaaaaa",
        "aaaaaaa",
        "bbbbbbbb cccccccc",
        "Neo",
        "neo@example.com",
        "2026-08-06T12:00:00-07:00",
        "HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1.0.0",
        "ship graph",
      ].join("\x1f"),
      "\x1e\n",
    ].join("");

    expect(parseGitCommitGraphLog(stdout)).toEqual([
      {
        sha: "aaaaaaaa",
        shortSha: "aaaaaaa",
        parents: ["bbbbbbbb", "cccccccc"],
        authorName: "Neo",
        authorEmail: "neo@example.com",
        committedAt: "2026-08-06T12:00:00-07:00",
        subject: "ship graph",
        refs: [
          { name: "HEAD", kind: "head", current: true },
          { name: "main", kind: "branch", current: true },
          { name: "origin/main", kind: "remote", current: false },
          { name: "v1.0.0", kind: "tag", current: false },
        ],
      },
    ]);
  });

  it("deduplicates decorations and tolerates empty records", () => {
    expect(parseGitCommitGraphRefs("refs/heads/main, refs/heads/main, HEAD")).toEqual([
      { name: "main", kind: "branch", current: false },
      { name: "HEAD", kind: "head", current: true },
    ]);
    expect(parseGitCommitGraphLog("\n\x1e\n")).toEqual([]);
  });
});
