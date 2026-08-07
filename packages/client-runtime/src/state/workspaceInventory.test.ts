import { EnvironmentId, ProjectId, type VcsListWorktreesResult } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import type { EnvironmentProject } from "./models.ts";
import { buildMachineRepoWorktreeProjection } from "./workspaceInventory.ts";
import type { WorktreeInventoryView } from "./worktrees.ts";

const MACHINE_A = EnvironmentId.make("machine-a");
const MACHINE_B = EnvironmentId.make("machine-b");
const OBSERVED_AT = DateTime.makeUnsafe("2026-08-06T00:00:00.000Z");

function project(input: {
  readonly environmentId: EnvironmentId;
  readonly id: string;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly canonicalRemote?: string;
}): EnvironmentProject {
  return {
    environmentId: input.environmentId,
    id: ProjectId.make(input.id),
    title: input.title,
    workspaceRoot: input.workspaceRoot,
    repositoryIdentity:
      input.canonicalRemote === undefined
        ? null
        : {
            canonicalKey: input.canonicalRemote,
            locator: {
              source: "git-remote",
              remoteName: "origin",
              remoteUrl: "git@github.com:acme/pane0.git",
            },
            displayName: "pane0",
            name: "pane0",
          },
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  };
}

function inventory(input: {
  readonly environmentId: EnvironmentId;
  readonly root: string;
  readonly commonDirectory: string;
  readonly worktrees?: ReadonlyArray<{
    readonly path: string;
    readonly branchRef: string | null;
    readonly detached?: boolean;
  }>;
  readonly stale?: boolean;
  readonly connected?: boolean;
}): WorktreeInventoryView {
  const data: VcsListWorktreesResult = {
    isRepo: true,
    repositoryRoot: input.root,
    gitCommonDirectory: input.commonDirectory,
    worktrees: (input.worktrees ?? [{ path: input.root, branchRef: "refs/heads/main" }]).map(
      (worktree) => ({
        path: worktree.path,
        headSha: "abc123",
        branchRef: worktree.branchRef,
        detached: worktree.detached ?? false,
        bare: false,
        locked: false,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      }),
    ),
    freshness: {
      source: input.stale ? "cached-local" : "live-local",
      observedAt: OBSERVED_AT,
      expiresAt: Option.none(),
    },
  };
  const connected = input.connected ?? true;
  const stale = input.stale ?? false;
  return {
    environmentId: input.environmentId,
    requestedCwd: input.root,
    data,
    completeness: "complete",
    mode: "authoritative",
    connected,
    stale,
    mutationsEnabled: connected && !stale,
  };
}

describe("Machine → Repo → Worktree projection", () => {
  it("keeps physical clones distinct while attaching exact workspace routing roots", () => {
    const canonicalRemote = "github.com/acme/pane0";
    const projection = buildMachineRepoWorktreeProjection({
      machines: [
        {
          environmentId: MACHINE_A,
          label: "Old access label",
          connectionPhase: "offline",
        },
        { environmentId: MACHINE_A, label: "Laptop", connectionPhase: "connected" },
        { environmentId: MACHINE_B, label: "Server", connectionPhase: "connected" },
      ],
      projects: [
        project({
          environmentId: MACHINE_A,
          id: "project-a",
          title: "Pane0 app",
          workspaceRoot: "/clone-a/packages/app",
          canonicalRemote,
        }),
        project({
          environmentId: MACHINE_A,
          id: "project-b",
          title: "Pane0 second clone",
          workspaceRoot: "/clone-b",
          canonicalRemote,
        }),
        project({
          environmentId: MACHINE_A,
          id: "notes",
          title: "Notes",
          workspaceRoot: "/notes",
        }),
        project({
          environmentId: MACHINE_B,
          id: "project-server",
          title: "Pane0 server clone",
          workspaceRoot: "/srv/pane0",
          canonicalRemote,
        }),
      ],
      inventories: [
        inventory({
          environmentId: MACHINE_A,
          root: "/clone-a",
          commonDirectory: "/clone-a/.git",
          worktrees: [
            { path: "/clone-a", branchRef: "refs/heads/main" },
            { path: "/worktrees/feature", branchRef: "refs/heads/feature" },
          ],
        }),
        inventory({
          environmentId: MACHINE_A,
          root: "/clone-b",
          commonDirectory: "/clone-b/.git",
        }),
        inventory({
          environmentId: MACHINE_B,
          root: "/srv/pane0",
          commonDirectory: "/srv/pane0/.git",
        }),
      ],
    });

    expect(projection.machines).toHaveLength(2);
    const laptop = projection.machines.find((machine) => machine.environmentId === MACHINE_A)!;
    expect(laptop.label).toBe("Laptop");
    expect(laptop.repositories).toHaveLength(2);
    expect(new Set(laptop.repositories.map((repository) => repository.key))).toEqual(
      new Set([`${MACHINE_A}:/clone-a/.git`, `${MACHINE_A}:/clone-b/.git`]),
    );
    expect(laptop.repositories.flatMap((repository) => repository.worktrees)).toHaveLength(3);
    expect(
      laptop.repositories
        .find((repository) => repository.repositoryRoot === "/clone-a")
        ?.worktrees.find((worktree) => worktree.path === "/clone-a")?.workspaces,
    ).toEqual([
      {
        projectId: ProjectId.make("project-a"),
        title: "Pane0 app",
        workspaceRoot: "/clone-a/packages/app",
      },
    ]);
    expect(laptop.standaloneWorkspaces.map((workspace) => workspace.title)).toEqual(["Notes"]);
    expect(
      projection.machines.find((machine) => machine.environmentId === MACHINE_B)?.repositories[0]
        ?.logicalRepositoryKeys,
    ).toEqual([canonicalRemote]);
  });

  it("does not invent a physical Repo from an old-server partial fallback", () => {
    const workspace = project({
      environmentId: MACHINE_A,
      id: "legacy",
      title: "Legacy workspace",
      workspaceRoot: "/legacy",
    });
    const partial: WorktreeInventoryView = {
      ...inventory({
        environmentId: MACHINE_A,
        root: "/legacy",
        commonDirectory: "/legacy/.git",
      }),
      data: {
        ...inventory({
          environmentId: MACHINE_A,
          root: "/legacy",
          commonDirectory: "/legacy/.git",
        }).data!,
        repositoryRoot: null,
        gitCommonDirectory: null,
      },
      completeness: "partial",
      mode: "refs-fallback",
      mutationsEnabled: false,
    };

    const [machine] = buildMachineRepoWorktreeProjection({
      machines: [{ environmentId: MACHINE_A, label: "Laptop", connectionPhase: "connected" }],
      projects: [workspace],
      inventories: [partial],
    }).machines;

    expect(machine?.repositories).toEqual([]);
    expect(machine?.standaloneWorkspaces[0]?.discovery).toBe("partial");
  });

  it("keeps stale disconnected repositories visible and disables mutations", () => {
    const [machine] = buildMachineRepoWorktreeProjection({
      machines: [{ environmentId: MACHINE_A, label: "Laptop", connectionPhase: "offline" }],
      projects: [],
      inventories: [
        inventory({
          environmentId: MACHINE_A,
          root: "/repo",
          commonDirectory: "/repo/.git",
          connected: false,
          stale: true,
        }),
      ],
    }).machines;

    expect(machine?.repositories[0]?.stale).toBe(true);
    expect(machine?.repositories[0]?.mutationsEnabled).toBe(false);
    expect(machine?.repositories[0]?.worktrees[0]?.path).toBe("/repo");
  });

  it("attaches a nested workspace to the deepest containing Worktree", () => {
    const nested = project({
      environmentId: MACHINE_A,
      id: "nested",
      title: "Nested",
      workspaceRoot: "/repo/nested/packages/app",
    });
    const [repository] = buildMachineRepoWorktreeProjection({
      machines: [{ environmentId: MACHINE_A, label: "Laptop", connectionPhase: "connected" }],
      projects: [nested],
      inventories: [
        inventory({
          environmentId: MACHINE_A,
          root: "/repo",
          commonDirectory: "/repo/.git",
          worktrees: [
            { path: "/repo", branchRef: "refs/heads/main" },
            { path: "/repo/nested", branchRef: "refs/heads/nested" },
          ],
        }),
      ],
    }).machines[0]!.repositories;

    expect(repository?.worktrees.find((worktree) => worktree.path === "/repo")?.workspaces).toEqual(
      [],
    );
    expect(
      repository?.worktrees.find((worktree) => worktree.path === "/repo/nested")?.workspaces[0]
        ?.workspaceRoot,
    ).toBe("/repo/nested/packages/app");
  });
});
