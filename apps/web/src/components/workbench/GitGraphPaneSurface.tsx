import type { VcsCommitGraphCommit, VcsListCommitGraphResult } from "@t3tools/contracts";
import {
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  GitMerge,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import { layoutGitCommitGraph, type GitGraphRow } from "~/workbench/gitGraphLayout";
import { buildGitGraphRefBadges, type GitGraphRefBadge } from "~/workbench/gitGraphRefs";
import { buildGitGraphDisplayRows, type GitGraphDisplayRow } from "~/workbench/gitGraphCompact";
import {
  selectGitGraphPresentation,
  useGitGraphRuntimeStore,
} from "~/workbench/gitGraphRuntimeStore";
import type { PaneDescriptor } from "~/workbench/model";
import { calculateGitGraphViewportMetrics } from "~/workbench/gitGraphViewport";

type GitGraphPaneDescriptor = Extract<PaneDescriptor, { kind: "git-graph" }>;

const PAGE_SIZE = 200;
const ROW_HEIGHT = 58;
const LANE_GAP = 18;
const LANE_OFFSET = 10;
const LANE_COLORS = [
  "text-sky-400",
  "text-violet-400",
  "text-emerald-400",
  "text-amber-400",
  "text-rose-400",
  "text-cyan-400",
] as const;

function laneClass(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? LANE_COLORS[0];
}

function GraphCell(props: {
  readonly row: GitGraphRow;
  readonly canvasWidth: number;
  readonly viewportWidth: number;
  readonly graphOffset: number;
  readonly rowIndex: number;
}) {
  const x = (lane: number) => LANE_OFFSET + lane * LANE_GAP;
  const centerY = ROW_HEIGHT / 2;
  return (
    <div className="overflow-hidden" style={{ width: props.viewportWidth }}>
      <svg
        aria-hidden="true"
        className="block shrink-0 overflow-visible"
        width={props.canvasWidth}
        height={ROW_HEIGHT}
        viewBox={`0 0 ${props.canvasWidth} ${ROW_HEIGHT}`}
        style={{ transform: `translateX(${-props.graphOffset}px)` }}
      >
        {props.row.continuingLanes.map((lane) => (
          <line
            key={`continuing-${lane}`}
            className={laneClass(lane)}
            x1={x(lane)}
            x2={x(lane)}
            y1={0}
            y2={ROW_HEIGHT}
            stroke="currentColor"
            strokeWidth={2}
          />
        ))}
        {props.rowIndex > 0 ? (
          <line
            className={laneClass(props.row.lane)}
            x1={x(props.row.lane)}
            x2={x(props.row.lane)}
            y1={0}
            y2={centerY}
            stroke="currentColor"
            strokeWidth={2}
          />
        ) : null}
        {props.row.edges.map((edge) => (
          <path
            key={`${edge.fromLane}-${edge.toLane}`}
            className={laneClass(edge.toLane)}
            d={`M ${x(edge.fromLane)} ${centerY} C ${x(edge.fromLane)} ${centerY + 12}, ${x(edge.toLane)} ${ROW_HEIGHT - 12}, ${x(edge.toLane)} ${ROW_HEIGHT}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          />
        ))}
        <circle
          className={laneClass(props.row.lane)}
          cx={x(props.row.lane)}
          cy={centerY}
          r={5}
          fill="var(--background)"
          stroke="currentColor"
          strokeWidth={3}
        />
      </svg>
    </div>
  );
}

function refBadgeClass(kind: VcsCommitGraphCommit["refs"][number]["kind"]): string {
  return cn(
    kind === "tag" && "bg-amber-500/15 text-amber-400",
    kind === "remote" && "bg-sky-500/15 text-sky-400",
    kind === "branch" && "bg-emerald-500/15 text-emerald-400",
    kind === "head" && "bg-primary/15 text-primary",
  );
}

function RefBadge({ badge }: { readonly badge: GitGraphRefBadge }) {
  if (badge.type === "branch-group") {
    return (
      <span className="inline-flex max-w-64 overflow-hidden rounded bg-emerald-500/15 text-[10px] font-medium text-emerald-400">
        <span className="truncate px-1.5 py-0.5">{badge.local.name}</span>
        {badge.remotes.map(({ remoteName, ref }) => (
          <span
            key={ref.name}
            className="border-l border-emerald-500/20 bg-sky-500/10 px-1.5 py-0.5 text-sky-400"
            title={ref.name}
          >
            {remoteName}
          </span>
        ))}
      </span>
    );
  }
  const { ref } = badge;
  return (
    <span
      className={cn(
        "inline-flex max-w-40 items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        refBadgeClass(ref.kind),
      )}
      title={ref.name}
    >
      <span className="truncate">{ref.name}</span>
    </span>
  );
}

function formatCommitDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function CommitRow(props: {
  readonly row: GitGraphRow;
  readonly graphCanvasWidth: number;
  readonly graphViewportWidth: number;
  readonly graphOffset: number;
  readonly rowIndex: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { commit } = props.row;
  return (
    <div className="border-b border-border/65" data-git-commit={commit.sha}>
      <button
        type="button"
        className="flex w-full items-center text-left hover:bg-muted/35"
        style={{ minWidth: props.graphViewportWidth + 560 }}
        onClick={props.onToggle}
      >
        <div className="sticky left-0 z-[1] flex shrink-0 bg-background/95 pl-2 backdrop-blur-sm">
          <GraphCell
            row={props.row}
            canvasWidth={props.graphCanvasWidth}
            viewportWidth={props.graphViewportWidth}
            graphOffset={props.graphOffset}
            rowIndex={props.rowIndex}
          />
        </div>
        <div
          className="flex min-w-0 flex-1 items-center gap-3 pr-4"
          style={{ minHeight: ROW_HEIGHT }}
        >
          {commit.parents.length > 1 ? (
            <GitMerge className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-medium">
                {commit.subject || "(no subject)"}
              </span>
              {buildGitGraphRefBadges(commit.refs).map((badge) => (
                <RefBadge
                  key={
                    badge.type === "branch-group"
                      ? `branch-group:${badge.local.name}`
                      : `${badge.ref.kind}:${badge.ref.name}`
                  }
                  badge={badge}
                />
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="truncate">{commit.authorName || commit.authorEmail}</span>
              <span>·</span>
              <span>{formatCommitDate(commit.committedAt)}</span>
            </div>
          </div>
          <code className="w-20 shrink-0 text-right text-[10px] text-muted-foreground">
            {commit.shortSha}
          </code>
          {props.expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      {props.expanded ? (
        <div className="ml-4 grid min-w-[640px] grid-cols-[80px_1fr] gap-x-3 gap-y-1 border-l border-border px-4 py-3 text-[11px]">
          <span className="text-muted-foreground">Commit</span>
          <code className="select-all">{commit.sha}</code>
          <span className="text-muted-foreground">Author</span>
          <span>
            {commit.authorEmail
              ? `${commit.authorName} <${commit.authorEmail}>`
              : commit.authorName}
          </span>
          <span className="text-muted-foreground">Parents</span>
          <span className="flex flex-wrap gap-2">
            {commit.parents.length === 0
              ? "Root commit"
              : commit.parents.map((parent) => <code key={parent}>{parent.slice(0, 12)}</code>)}
          </span>
          <p className="col-span-2 mt-2 whitespace-pre-wrap border-t pt-3 text-foreground/90">
            {commit.body || commit.subject}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SegmentRow(props: {
  readonly segment: Extract<GitGraphDisplayRow, { kind: "segment" }>;
  readonly graphCanvasWidth: number;
  readonly graphViewportWidth: number;
  readonly graphOffset: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly expandedSha: string | null;
  readonly onCommitToggle: (sha: string) => void;
}) {
  const x = LANE_OFFSET + props.segment.lane * LANE_GAP;
  if (props.expanded) {
    return (
      <div className="border-y border-primary/20 bg-primary/[0.025]">
        <button
          type="button"
          className="sticky left-2 z-[2] m-1 rounded bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm hover:text-foreground"
          onClick={props.onToggle}
        >
          Collapse {props.segment.rows.length} commits
        </button>
        {props.segment.rows.map(({ row, originalIndex }) => (
          <CommitRow
            key={row.commit.sha}
            row={row}
            graphCanvasWidth={props.graphCanvasWidth}
            graphViewportWidth={props.graphViewportWidth}
            graphOffset={props.graphOffset}
            rowIndex={originalIndex}
            expanded={props.expandedSha === row.commit.sha}
            onToggle={() => props.onCommitToggle(row.commit.sha)}
          />
        ))}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="flex w-full items-center border-b border-border/65 text-left hover:bg-muted/35"
      style={{ minWidth: props.graphViewportWidth + 560 }}
      onClick={props.onToggle}
    >
      <div
        className="sticky left-0 z-[1] flex shrink-0 overflow-hidden bg-background/95 pl-2 backdrop-blur-sm"
        style={{ width: props.graphViewportWidth + 8 }}
      >
        <svg
          aria-hidden="true"
          className="shrink-0"
          width={props.graphCanvasWidth}
          height={ROW_HEIGHT}
          viewBox={`0 0 ${props.graphCanvasWidth} ${ROW_HEIGHT}`}
          style={{ transform: `translateX(${-props.graphOffset}px)` }}
        >
          <line
            className={laneClass(props.segment.lane)}
            x1={x}
            x2={x}
            y1={0}
            y2={ROW_HEIGHT}
            stroke="currentColor"
            strokeWidth={2}
          />
          <circle
            className={laneClass(props.segment.lane)}
            cx={x}
            cy={ROW_HEIGHT / 2}
            r={9}
            fill="var(--background)"
            stroke="currentColor"
            strokeWidth={2}
          />
          <text
            x={x}
            y={ROW_HEIGHT / 2 + 3}
            textAnchor="middle"
            fill="currentColor"
            className="text-[8px] font-semibold text-foreground"
          >
            {props.segment.rows.length}
          </text>
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-4 text-xs">
        <ChevronRight className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{props.segment.rows.length} commits</span>
        <span className="truncate text-[10px] text-muted-foreground">
          {props.segment.rows.at(-1)?.row.commit.subject} →{" "}
          {props.segment.rows[0]?.row.commit.subject}
        </span>
      </div>
    </button>
  );
}

export function GitGraphPaneSurface({ pane }: { readonly pane: GitGraphPaneDescriptor }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(900);
  const [graphOffset, setGraphOffset] = useState(0);
  const serverConfigs = useServerConfigs();
  const supportsCommitGraph =
    serverConfigs.get(pane.scope.environmentId)?.environment.capabilities.gitCommitGraph === true;
  const query = useEnvironmentQuery(
    supportsCommitGraph
      ? vcsEnvironment.commitGraph({
          environmentId: pane.scope.environmentId,
          input: { cwd: pane.canonicalWorktreePath, limit: PAGE_SIZE },
        })
      : null,
  );
  const loadPage = useAtomCommand(vcsEnvironment.commitGraphPage, { reportFailure: true });
  const [pageState, setPageState] = useState<{
    readonly key: string;
    readonly commits: ReadonlyArray<VcsCommitGraphCommit>;
    readonly nextCursor: number | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
  const presentation = useGitGraphRuntimeStore((state) =>
    selectGitGraphPresentation(state, pane.repositoryKey),
  );
  const setGraphMode = useGitGraphRuntimeStore((state) => state.setMode);
  const setCollapseThreshold = useGitGraphRuntimeStore((state) => state.setCollapseThreshold);
  const setPreferredWidth = useGitGraphRuntimeStore((state) => state.setPreferredWidth);
  const targetKey = `${pane.scope.environmentId}:${pane.canonicalWorktreePath}`;

  useEffect(() => {
    if (query.data === null) return;
    setPageState({
      key: targetKey,
      commits: query.data.commits,
      nextCursor: query.data.nextCursor,
    });
  }, [query.data, targetKey]);

  const visibleState = pageState?.key === targetKey ? pageState : null;
  const commits = visibleState?.commits ?? query.data?.commits ?? [];
  const nextCursor = visibleState?.nextCursor ?? query.data?.nextCursor ?? null;
  const rows = useMemo(() => layoutGitCommitGraph(commits), [commits]);
  const displayRows = useMemo(
    () =>
      presentation.mode === "compact"
        ? buildGitGraphDisplayRows(rows, presentation.collapseThreshold)
        : rows.map(
            (row, originalIndex): GitGraphDisplayRow => ({
              kind: "commit",
              id: row.commit.sha,
              row,
              originalIndex,
            }),
          ),
    [presentation, rows],
  );
  const graphWidth = useMemo(
    () => LANE_OFFSET * 2 + Math.max(1, ...rows.map((row) => row.laneCount)) * LANE_GAP,
    [rows],
  );
  const graphViewport = useMemo(
    () =>
      calculateGitGraphViewportMetrics({
        intrinsicWidth: graphWidth,
        availableWidth,
        preferredWidth: presentation.preferredWidth,
      }),
    [availableWidth, graphWidth, presentation.preferredWidth],
  );

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setAvailableWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setGraphOffset((current) => Math.min(current, graphViewport.maxGraphOffset));
  }, [graphViewport.maxGraphOffset]);

  const handleLoadMore = useCallback(async () => {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    const result = await loadPage({
      environmentId: pane.scope.environmentId,
      input: { cwd: pane.canonicalWorktreePath, cursor: nextCursor, limit: PAGE_SIZE },
    });
    if (result._tag === "Success") {
      const page: VcsListCommitGraphResult = result.value;
      setPageState((current) => {
        const existing = current?.key === targetKey ? current.commits : commits;
        const known = new Set(existing.map((commit) => commit.sha));
        return {
          key: targetKey,
          commits: [...existing, ...page.commits.filter((commit) => !known.has(commit.sha))],
          nextCursor: page.nextCursor,
        };
      });
    }
    setLoadingMore(false);
  }, [commits, loadPage, loadingMore, nextCursor, pane, targetKey]);

  if (!supportsCommitGraph) {
    return (
      <div className="flex size-full items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium">Git Graph needs a newer Machine runtime</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This Pane is capability-gated so older official clients and servers keep working without
            receiving an unknown RPC.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex size-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <GitMerge className="size-4 text-sky-400" />
        <span className="text-xs font-medium">All refs</span>
        <select
          aria-label="Git Graph layout mode"
          className="h-7 rounded border bg-background px-1.5 text-[10px]"
          value={presentation.mode}
          onChange={(event) =>
            setGraphMode(
              pane.repositoryKey,
              event.currentTarget.value === "full" ? "full" : "compact",
            )
          }
        >
          <option value="compact">Compact</option>
          <option value="full">Full history</option>
        </select>
        {presentation.mode === "compact" ? (
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Collapse
            <input
              aria-label="Minimum commits to collapse"
              className="h-7 w-10 rounded border bg-background px-1 text-center text-[10px] text-foreground"
              type="number"
              min={3}
              max={99}
              value={presentation.collapseThreshold}
              onChange={(event) =>
                setCollapseThreshold(pane.repositoryKey, Number(event.currentTarget.value))
              }
            />
          </label>
        ) : null}
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Width
          <input
            aria-label="Git Graph column width"
            className="w-16 accent-primary"
            type="range"
            min={72}
            max={720}
            value={graphViewport.preferredWidth}
            onChange={(event) =>
              setPreferredWidth(pane.repositoryKey, Number(event.currentTarget.value))
            }
          />
        </label>
        {presentation.preferredWidth !== null ? (
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-1.5 text-[10px]"
            onDoubleClick={() => setPreferredWidth(pane.repositoryKey, null)}
            onClick={() => setPreferredWidth(pane.repositoryKey, null)}
            title="Return Graph width to automatic topology fit"
          >
            Auto
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {query.data?.repositoryRoot ?? pane.canonicalWorktreePath}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={query.refresh} title="Refresh graph">
          <RefreshCw className={cn("size-3.5", query.isPending && "animate-spin")} />
        </Button>
      </div>
      <div className="flex h-7 shrink-0 items-center border-b bg-muted/15 text-[10px] text-muted-foreground">
        <div
          className="flex shrink-0 items-center gap-2 border-r px-2"
          style={{ width: graphViewport.effectiveWidth + 8 }}
        >
          <span>Graph</span>
          {graphViewport.maxGraphOffset > 0 ? (
            <input
              aria-label="Scroll Git Graph lanes"
              aria-valuemin={0}
              aria-valuemax={graphViewport.maxGraphOffset}
              aria-valuenow={graphOffset}
              className="min-w-0 flex-1 accent-primary"
              type="range"
              min={0}
              max={graphViewport.maxGraphOffset}
              value={graphOffset}
              onChange={(event) => setGraphOffset(Number(event.currentTarget.value))}
            />
          ) : null}
        </div>
        <span className="px-3">Message · Author · Date · Commit</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {query.error !== null ? (
          <div className="m-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <p className="font-medium text-destructive">Could not load commit graph</p>
            <p className="mt-1 text-muted-foreground">{query.error}</p>
          </div>
        ) : query.isPending && commits.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" /> Loading commit graph…
          </div>
        ) : query.data?.isRepo === false ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            The selected Worktree is not a Git repository.
          </div>
        ) : commits.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            This repository has no commits yet.
          </div>
        ) : (
          <>
            {displayRows.map((displayRow) =>
              displayRow.kind === "commit" ? (
                <CommitRow
                  key={displayRow.id}
                  row={displayRow.row}
                  graphCanvasWidth={graphViewport.intrinsicWidth}
                  graphViewportWidth={graphViewport.effectiveWidth}
                  graphOffset={graphOffset}
                  rowIndex={displayRow.originalIndex}
                  expanded={expandedSha === displayRow.row.commit.sha}
                  onToggle={() =>
                    setExpandedSha((current) =>
                      current === displayRow.row.commit.sha ? null : displayRow.row.commit.sha,
                    )
                  }
                />
              ) : (
                <SegmentRow
                  key={displayRow.id}
                  segment={displayRow}
                  graphCanvasWidth={graphViewport.intrinsicWidth}
                  graphViewportWidth={graphViewport.effectiveWidth}
                  graphOffset={graphOffset}
                  expanded={expandedSegmentId === displayRow.id}
                  onToggle={() =>
                    setExpandedSegmentId((current) =>
                      current === displayRow.id ? null : displayRow.id,
                    )
                  }
                  expandedSha={expandedSha}
                  onCommitToggle={(sha) =>
                    setExpandedSha((current) => (current === sha ? null : sha))
                  }
                />
              ),
            )}
            {nextCursor !== null ? (
              <div className="flex justify-center p-3">
                <Button variant="outline" size="sm" disabled={loadingMore} onClick={handleLoadMore}>
                  {loadingMore ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                  Load older commits
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
