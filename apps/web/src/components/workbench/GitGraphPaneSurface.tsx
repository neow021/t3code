import type { VcsCommitGraphCommit, VcsListCommitGraphResult } from "@t3tools/contracts";
import {
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  GitMerge,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useServerConfigs } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import { layoutGitCommitGraph, type GitGraphRow } from "~/workbench/gitGraphLayout";
import type { PaneDescriptor } from "~/workbench/model";

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
  readonly width: number;
  readonly rowIndex: number;
}) {
  const x = (lane: number) => LANE_OFFSET + lane * LANE_GAP;
  const centerY = ROW_HEIGHT / 2;
  return (
    <svg
      aria-hidden="true"
      className="block shrink-0 overflow-visible"
      width={props.width}
      height={ROW_HEIGHT}
      viewBox={`0 0 ${props.width} ${ROW_HEIGHT}`}
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
  );
}

function RefBadge({ ref }: { readonly ref: VcsCommitGraphCommit["refs"][number] }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-40 items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
        ref.kind === "tag" && "bg-amber-500/15 text-amber-400",
        ref.kind === "remote" && "bg-sky-500/15 text-sky-400",
        ref.kind === "branch" && "bg-emerald-500/15 text-emerald-400",
        ref.kind === "head" && "bg-primary/15 text-primary",
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
  readonly graphWidth: number;
  readonly rowIndex: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { commit } = props.row;
  return (
    <div className="border-b border-border/65" data-git-commit={commit.sha}>
      <button
        type="button"
        className="flex w-full min-w-[680px] items-center text-left hover:bg-muted/35"
        onClick={props.onToggle}
      >
        <div className="sticky left-0 z-[1] flex shrink-0 bg-background/95 pl-2 backdrop-blur-sm">
          <GraphCell row={props.row} width={props.graphWidth} rowIndex={props.rowIndex} />
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
              {commit.refs.map((ref) => (
                <RefBadge key={`${ref.kind}:${ref.name}`} ref={ref} />
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
        </div>
      ) : null}
    </div>
  );
}

export function GitGraphPaneSurface({ pane }: { readonly pane: GitGraphPaneDescriptor }) {
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
  const graphWidth = useMemo(
    () => LANE_OFFSET * 2 + Math.max(1, ...rows.map((row) => row.laneCount)) * LANE_GAP,
    [rows],
  );

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
    <div className="flex size-full min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <GitMerge className="size-4 text-sky-400" />
        <span className="text-xs font-medium">All refs</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {query.data?.repositoryRoot ?? pane.canonicalWorktreePath}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={query.refresh} title="Refresh graph">
          <RefreshCw className={cn("size-3.5", query.isPending && "animate-spin")} />
        </Button>
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
            {rows.map((row, index) => (
              <CommitRow
                key={row.commit.sha}
                row={row}
                graphWidth={graphWidth}
                rowIndex={index}
                expanded={expandedSha === row.commit.sha}
                onToggle={() =>
                  setExpandedSha((current) => (current === row.commit.sha ? null : row.commit.sha))
                }
              />
            ))}
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
