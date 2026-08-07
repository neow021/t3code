import { describe, expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  VcsCreateWorktreeInput,
  VcsListCommitGraphResult,
  VcsListWorktreesResult,
  GitPreparePullRequestThreadInput,
  GitRunStackedActionResult,
  GitRunStackedActionInput,
  GitResolvePullRequestResult,
} from "./git.ts";

const decodeCreateWorktreeInput = Schema.decodeUnknownSync(VcsCreateWorktreeInput);
const decodePreparePullRequestThreadInput = Schema.decodeUnknownSync(
  GitPreparePullRequestThreadInput,
);
const decodeRunStackedActionInput = Schema.decodeUnknownSync(GitRunStackedActionInput);
const decodeRunStackedActionResult = Schema.decodeUnknownSync(GitRunStackedActionResult);
const decodeResolvePullRequestResult = Schema.decodeUnknownSync(GitResolvePullRequestResult);
const decodeListWorktreesResult = Schema.decodeUnknownSync(VcsListWorktreesResult);
const decodeListCommitGraphResult = Schema.decodeUnknownSync(VcsListCommitGraphResult);

describe("VcsListWorktreesResult", () => {
  it("decodes complete physical worktree state and freshness", () => {
    const parsed = decodeListWorktreesResult({
      isRepo: true,
      repositoryRoot: "/repo/main",
      gitCommonDirectory: "/repo/main/.git",
      worktrees: [
        {
          path: "/repo/feature",
          headSha: "0123456789abcdef",
          branchRef: null,
          detached: true,
          bare: false,
          locked: true,
          lockedReason: "maintenance",
          prunable: false,
          prunableReason: null,
        },
      ],
      freshness: {
        source: "live-local",
        observedAt: DateTime.makeUnsafe("2026-08-06T00:00:00.000Z"),
        expiresAt: Option.none(),
      },
    });

    expect(parsed.worktrees[0]?.detached).toBe(true);
    expect(parsed.worktrees[0]?.lockedReason).toBe("maintenance");
    expect(parsed.freshness.source).toBe("live-local");
  });
});

describe("VcsListCommitGraphResult", () => {
  it("round-trips paged topology and optional ref decorations", () => {
    const parsed = decodeListCommitGraphResult({
      isRepo: true,
      repositoryRoot: "/repo",
      headSha: "aaaaaaaa",
      commits: [
        {
          sha: "aaaaaaaa",
          shortSha: "aaaaaaa",
          parents: ["bbbbbbbb"],
          subject: "feat: graph",
          body: "feat: graph\n\nDetailed body.",
          authorName: "Neo",
          authorEmail: "neo@example.com",
          committedAt: "2026-08-06T12:00:00-07:00",
          refs: [{ name: "main", kind: "branch", current: true }],
        },
      ],
      nextCursor: 1,
      freshness: {
        source: "live-local",
        observedAt: DateTime.makeUnsafe("2026-08-06T19:00:00.000Z"),
        expiresAt: Option.none(),
      },
    });

    expect(parsed.commits[0]?.parents).toEqual(["bbbbbbbb"]);
    expect(parsed.commits[0]?.refs[0]?.current).toBe(true);
    expect(parsed.nextCursor).toBe(1);
  });
});

describe("VcsCreateWorktreeInput", () => {
  it("accepts omitted newRefName for existing-refName worktrees", () => {
    const parsed = decodeCreateWorktreeInput({
      cwd: "/repo",
      refName: "feature/existing",
      path: "/tmp/worktree",
    });

    expect(parsed.newRefName).toBeUndefined();
    expect(parsed.refName).toBe("feature/existing");
  });

  it("accepts baseRefName metadata for a new worktree ref", () => {
    const parsed = decodeCreateWorktreeInput({
      cwd: "/repo",
      refName: "0123456789abcdef",
      newRefName: "feature/new",
      baseRefName: "origin/main",
      path: "/tmp/worktree",
    });

    expect(parsed.baseRefName).toBe("origin/main");
  });
});

describe("GitPreparePullRequestThreadInput", () => {
  it("accepts pull request references and mode", () => {
    const parsed = decodePreparePullRequestThreadInput({
      cwd: "/repo",
      reference: "#42",
      mode: "worktree",
    });

    expect(parsed.reference).toBe("#42");
    expect(parsed.mode).toBe("worktree");
  });
});

describe("GitResolvePullRequestResult", () => {
  it("decodes resolved pull request metadata", () => {
    const parsed = decodeResolvePullRequestResult({
      pullRequest: {
        number: 42,
        title: "PR threads",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseBranch: "main",
        headBranch: "feature/pr-threads",
        state: "open",
      },
    });

    expect(parsed.pullRequest.number).toBe(42);
    expect(parsed.pullRequest.headBranch).toBe("feature/pr-threads");
  });
});

describe("GitRunStackedActionInput", () => {
  it("accepts explicit stacked actions and requires a client-provided actionId", () => {
    const parsed = decodeRunStackedActionInput({
      actionId: "action-1",
      cwd: "/repo",
      action: "create_pr",
    });

    expect(parsed.actionId).toBe("action-1");
    expect(parsed.action).toBe("create_pr");
  });
});

describe("GitRunStackedActionResult", () => {
  it("decodes a server-authored completion toast", () => {
    const parsed = decodeRunStackedActionResult({
      action: "commit_push",
      branch: {
        status: "created",
        name: "feature/server-owned-toast",
      },
      commit: {
        status: "created",
        commitSha: "89abcdef01234567",
        subject: "feat: move toast state into git manager",
      },
      push: {
        status: "pushed",
        branch: "feature/server-owned-toast",
        upstreamBranch: "origin/feature/server-owned-toast",
      },
      pr: {
        status: "skipped_not_requested",
      },
      toast: {
        title: "Pushed 89abcde to origin/feature/server-owned-toast",
        description: "feat: move toast state into git manager",
        cta: {
          kind: "run_action",
          label: "Create PR",
          action: {
            kind: "create_pr",
          },
        },
      },
    });

    expect(parsed.toast.cta.kind).toBe("run_action");
    if (parsed.toast.cta.kind === "run_action") {
      expect(parsed.toast.cta.action.kind).toBe("create_pr");
    }
  });
});
