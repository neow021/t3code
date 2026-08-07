import type { GitGraphRow } from "./gitGraphLayout";

export const DEFAULT_GIT_GRAPH_COLLAPSE_THRESHOLD = 3;
export const MIN_GIT_GRAPH_COLLAPSE_THRESHOLD = 3;
export const MAX_GIT_GRAPH_COLLAPSE_THRESHOLD = 99;

export type GitGraphDisplayRow =
  | {
      readonly kind: "commit";
      readonly id: string;
      readonly row: GitGraphRow;
      readonly originalIndex: number;
    }
  | {
      readonly kind: "segment";
      readonly id: string;
      readonly rows: ReadonlyArray<{ readonly row: GitGraphRow; readonly originalIndex: number }>;
      readonly lane: number;
      readonly laneCount: number;
    };

export function normalizeGitGraphCollapseThreshold(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    return DEFAULT_GIT_GRAPH_COLLAPSE_THRESHOLD;
  }
  return Math.min(
    MAX_GIT_GRAPH_COLLAPSE_THRESHOLD,
    Math.max(MIN_GIT_GRAPH_COLLAPSE_THRESHOLD, Math.round(parsed)),
  );
}

function canCollapse(row: GitGraphRow, childCounts: ReadonlyMap<string, number>): boolean {
  return (
    row.commit.refs.length === 0 &&
    row.commit.parents.length === 1 &&
    (childCounts.get(row.commit.sha) ?? 0) === 1 &&
    row.edges.length === 1 &&
    row.edges[0]?.fromLane === row.lane &&
    row.edges[0]?.toLane === row.lane
  );
}

/** Collapses only unmarked, non-branching linear runs; topology boundaries remain real rows. */
export function buildGitGraphDisplayRows(
  rows: ReadonlyArray<GitGraphRow>,
  threshold = DEFAULT_GIT_GRAPH_COLLAPSE_THRESHOLD,
): ReadonlyArray<GitGraphDisplayRow> {
  const normalizedThreshold = normalizeGitGraphCollapseThreshold(threshold);
  const childCounts = new Map<string, number>();
  for (const row of rows) {
    for (const parent of row.commit.parents) {
      childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
    }
  }
  const display: GitGraphDisplayRow[] = [];
  let run: Array<{ readonly row: GitGraphRow; readonly originalIndex: number }> = [];
  const flush = () => {
    if (run.length >= normalizedThreshold) {
      const first = run[0]!;
      display.push({
        kind: "segment",
        id: `segment:${first.row.commit.sha}:${run.at(-1)!.row.commit.sha}`,
        rows: run,
        lane: first.row.lane,
        laneCount: Math.max(...run.map(({ row }) => row.laneCount)),
      });
    } else {
      display.push(
        ...run.map(({ row, originalIndex }) => ({
          kind: "commit" as const,
          id: row.commit.sha,
          row,
          originalIndex,
        })),
      );
    }
    run = [];
  };

  rows.forEach((row, originalIndex) => {
    const previous = run.at(-1)?.row;
    const continuous =
      previous === undefined ||
      (previous.commit.parents[0] === row.commit.sha && previous.lane === row.lane);
    if (!canCollapse(row, childCounts) || !continuous) {
      flush();
      if (!canCollapse(row, childCounts)) {
        display.push({ kind: "commit", id: row.commit.sha, row, originalIndex });
        return;
      }
    }
    run.push({ row, originalIndex });
  });
  flush();
  return display;
}
