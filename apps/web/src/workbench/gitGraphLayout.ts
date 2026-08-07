import type { VcsCommitGraphCommit } from "@t3tools/contracts";

export interface GitGraphEdge {
  readonly fromLane: number;
  readonly toLane: number;
}

export interface GitGraphRow {
  readonly commit: VcsCommitGraphCommit;
  readonly lane: number;
  readonly laneCount: number;
  readonly continuingLanes: ReadonlyArray<number>;
  readonly edges: ReadonlyArray<GitGraphEdge>;
}

function firstAvailableLane(lanes: ReadonlyArray<string | null>): number {
  const emptyLane = lanes.indexOf(null);
  return emptyLane === -1 ? lanes.length : emptyLane;
}

/**
 * Assigns stable lanes to date-ordered commits without asking the browser to interpret Git.
 * The server owns commit enumeration; this pure projection only turns parent links into rows.
 */
export function layoutGitCommitGraph(
  commits: ReadonlyArray<VcsCommitGraphCommit>,
): ReadonlyArray<GitGraphRow> {
  let lanes: Array<string | null> = [];
  const rows: GitGraphRow[] = [];

  for (const commit of commits) {
    let lane = lanes.indexOf(commit.sha);
    if (lane === -1) {
      lane = firstAvailableLane(lanes);
      lanes[lane] = commit.sha;
    }

    const before = [...lanes];
    const after = [...lanes];
    after[lane] = null;
    const edges: GitGraphEdge[] = [];

    for (const [parentIndex, parentSha] of commit.parents.entries()) {
      let parentLane = after.indexOf(parentSha);
      if (parentLane === -1) {
        const preferredLane = parentIndex === 0 && after[lane] === null ? lane : -1;
        parentLane = preferredLane === -1 ? firstAvailableLane(after) : preferredLane;
        after[parentLane] = parentSha;
      }
      edges.push({ fromLane: lane, toLane: parentLane });
    }

    const continuingLanes = before
      .map((sha, index) => ({ sha, index }))
      .filter(({ sha, index }) => sha !== null && index !== lane)
      .map(({ index }) => index);
    const laneCount = Math.max(1, before.length, after.length);
    rows.push({ commit, lane, laneCount, continuingLanes, edges });

    while (after.at(-1) === null) after.pop();
    lanes = after;
  }

  return rows;
}
