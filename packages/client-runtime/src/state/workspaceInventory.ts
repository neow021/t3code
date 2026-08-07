import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { EnvironmentProject } from "./models.ts";
import { normalizeProjectPathForComparison } from "./projects.ts";
import type { WorktreeInventoryView } from "./worktrees.ts";

export interface WorkspaceInventoryMachineInput {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connectionPhase: string;
}

export interface WorkspaceRoutingCandidate {
  readonly projectId: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
}

export interface MachineWorkspaceNode extends WorkspaceRoutingCandidate {
  readonly kind: "workspace";
  readonly key: string;
  readonly discovery: "non-git-or-unknown" | "partial" | "unavailable";
}

export interface WorktreeNode {
  readonly kind: "worktree";
  readonly key: string;
  readonly path: string;
  readonly headSha: string | null;
  readonly branchRef: string | null;
  readonly detached: boolean;
  readonly bare: boolean;
  readonly locked: boolean;
  readonly prunable: boolean;
  readonly workspaces: ReadonlyArray<WorkspaceRoutingCandidate>;
}

export interface RepositoryNode {
  readonly kind: "repository";
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly repositoryRoot: string;
  readonly gitCommonDirectory: string;
  readonly worktrees: ReadonlyArray<WorktreeNode>;
  /** Logical remote identity is metadata only. It never participates in the
      physical Sidebar key or merges clones. */
  readonly logicalRepositoryKeys: ReadonlyArray<string>;
  readonly stale: boolean;
  readonly mutationsEnabled: boolean;
}

export interface MachineNode {
  readonly kind: "machine";
  readonly key: EnvironmentId;
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connectionPhase: string;
  readonly repositories: ReadonlyArray<RepositoryNode>;
  readonly standaloneWorkspaces: ReadonlyArray<MachineWorkspaceNode>;
}

export interface MachineRepoWorktreeProjection {
  readonly machines: ReadonlyArray<MachineNode>;
}

function normalizePath(value: string): string {
  return normalizeProjectPathForComparison(value).replace(/[\\/]+$/, "");
}

function pathContains(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePath(root);
  const normalizedCandidate = normalizePath(candidate);
  if (normalizedRoot.length === 0 || normalizedCandidate.length === 0) return false;
  const separator = normalizedRoot.includes("\\") ? "\\" : "/";
  return (
    normalizedRoot === normalizedCandidate ||
    normalizedCandidate.startsWith(`${normalizedRoot}${separator}`)
  );
}

function physicalRepositoryKey(environmentId: EnvironmentId, gitCommonDirectory: string): string {
  return `${environmentId}:${normalizePath(gitCommonDirectory)}`;
}

function worktreeKey(repositoryKey: string, path: string): string {
  return `${repositoryKey}:${normalizePath(path)}`;
}

function workspaceKey(environmentId: EnvironmentId, workspaceRoot: string): string {
  return `${environmentId}:workspace:${normalizePath(workspaceRoot)}`;
}

function pathLabel(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).findLast((segment) => segment.length > 0) ?? path;
}

function inventoryRank(view: WorktreeInventoryView): readonly [number, number] {
  if (view.data === null || view.completeness !== "complete") return [-1, -1];
  const liveRank = !view.stale && view.connected ? 2 : view.connected ? 1 : 0;
  return [liveRank, DateTime.toEpochMillis(view.data.freshness.observedAt)];
}

function compareInventory(left: WorktreeInventoryView, right: WorktreeInventoryView): number {
  const [leftLive, leftTime] = inventoryRank(left);
  const [rightLive, rightTime] = inventoryRank(right);
  return leftLive - rightLive || leftTime - rightTime;
}

function projectDiscovery(
  project: EnvironmentProject,
  inventories: ReadonlyArray<WorktreeInventoryView>,
): MachineWorkspaceNode["discovery"] {
  const matching = inventories.filter(
    (inventory) =>
      inventory.environmentId === project.environmentId &&
      pathContains(inventory.requestedCwd, project.workspaceRoot),
  );
  if (matching.some((inventory) => inventory.completeness === "partial")) return "partial";
  if (matching.some((inventory) => inventory.completeness === "unavailable")) {
    return "unavailable";
  }
  return "non-git-or-unknown";
}

/** Builds the Sidebar's only hierarchy. Window and Pane state is deliberately
    absent: those remain in the right-side Workbench projection. */
export function buildMachineRepoWorktreeProjection(input: {
  readonly machines: ReadonlyArray<WorkspaceInventoryMachineInput>;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly inventories: ReadonlyArray<WorktreeInventoryView>;
}): MachineRepoWorktreeProjection {
  const latestMachineById = new Map<EnvironmentId, WorkspaceInventoryMachineInput>();
  for (const machine of input.machines) latestMachineById.set(machine.environmentId, machine);

  const bestInventoryByRepository = new Map<string, WorktreeInventoryView>();
  for (const inventory of input.inventories) {
    const commonDirectory = inventory.data?.gitCommonDirectory;
    if (
      inventory.completeness !== "complete" ||
      commonDirectory === null ||
      commonDirectory === undefined
    ) {
      continue;
    }
    const key = physicalRepositoryKey(inventory.environmentId, commonDirectory);
    const existing = bestInventoryByRepository.get(key);
    if (existing === undefined || compareInventory(existing, inventory) < 0) {
      bestInventoryByRepository.set(key, inventory);
    }
  }

  const repositoriesByMachine = new Map<EnvironmentId, RepositoryNode[]>();
  for (const [key, inventoryView] of bestInventoryByRepository) {
    const inventory = inventoryView.data;
    if (
      inventory === null ||
      inventory.repositoryRoot === null ||
      inventory.gitCommonDirectory === null
    ) {
      continue;
    }
    const repositoryProjects = input.projects.filter(
      (project) =>
        project.environmentId === inventoryView.environmentId &&
        inventory.worktrees.some((worktree) => pathContains(worktree.path, project.workspaceRoot)),
    );
    const logicalRepositoryKeys = [
      ...new Set(
        repositoryProjects.flatMap((project) =>
          project.repositoryIdentity === null || project.repositoryIdentity === undefined
            ? []
            : [project.repositoryIdentity.canonicalKey],
        ),
      ),
    ].sort();
    const worktrees = inventory.worktrees
      .map(
        (worktree): WorktreeNode => ({
          kind: "worktree",
          key: worktreeKey(key, worktree.path),
          path: worktree.path,
          headSha: worktree.headSha,
          branchRef: worktree.branchRef,
          detached: worktree.detached,
          bare: worktree.bare,
          locked: worktree.locked,
          prunable: worktree.prunable,
          workspaces: repositoryProjects
            .filter((project) => pathContains(worktree.path, project.workspaceRoot))
            .filter(
              (project) =>
                !inventory.worktrees.some(
                  (candidate) =>
                    candidate.path !== worktree.path &&
                    pathContains(candidate.path, project.workspaceRoot) &&
                    normalizePath(candidate.path).length > normalizePath(worktree.path).length,
                ),
            )
            .map((project) => ({
              projectId: project.id,
              title: project.title,
              workspaceRoot: project.workspaceRoot,
            }))
            .sort((left, right) => left.workspaceRoot.localeCompare(right.workspaceRoot)),
        }),
      )
      .sort((left, right) => left.path.localeCompare(right.path));
    const label =
      repositoryProjects
        .map(
          (project) =>
            project.repositoryIdentity?.displayName ?? project.repositoryIdentity?.name ?? null,
        )
        .find((candidate): candidate is string => candidate !== null) ??
      pathLabel(inventory.repositoryRoot);
    const repository: RepositoryNode = {
      kind: "repository",
      key,
      environmentId: inventoryView.environmentId,
      label,
      repositoryRoot: inventory.repositoryRoot,
      gitCommonDirectory: inventory.gitCommonDirectory,
      worktrees,
      logicalRepositoryKeys,
      stale: inventoryView.stale,
      mutationsEnabled: inventoryView.mutationsEnabled,
    };
    const existing = repositoriesByMachine.get(inventoryView.environmentId);
    if (existing === undefined)
      repositoriesByMachine.set(inventoryView.environmentId, [repository]);
    else existing.push(repository);
  }

  const machines = [...latestMachineById.values()]
    .map((machine): MachineNode => {
      const repositories = (repositoriesByMachine.get(machine.environmentId) ?? []).sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.repositoryRoot.localeCompare(right.repositoryRoot),
      );
      const attachedProjects = new Set(
        repositories.flatMap((repository) =>
          repository.worktrees.flatMap((worktree) =>
            worktree.workspaces.map((workspace) => workspace.projectId),
          ),
        ),
      );
      const standaloneWorkspaces = input.projects
        .filter(
          (project) =>
            project.environmentId === machine.environmentId && !attachedProjects.has(project.id),
        )
        .map(
          (project): MachineWorkspaceNode => ({
            kind: "workspace",
            key: workspaceKey(machine.environmentId, project.workspaceRoot),
            projectId: project.id,
            title: project.title,
            workspaceRoot: project.workspaceRoot,
            discovery: projectDiscovery(project, input.inventories),
          }),
        )
        .sort((left, right) => left.title.localeCompare(right.title));
      return {
        kind: "machine",
        key: machine.environmentId,
        environmentId: machine.environmentId,
        label: machine.label,
        connectionPhase: machine.connectionPhase,
        repositories,
        standaloneWorkspaces,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));

  return { machines };
}
