import type { VcsCommitGraphRef } from "@t3tools/contracts";

const REF_PRIORITY: Record<VcsCommitGraphRef["kind"], number> = {
  head: 0,
  tag: 1,
  branch: 2,
  remote: 3,
};

export type GitGraphRefBadge =
  | { readonly type: "ref"; readonly ref: VcsCommitGraphRef }
  | {
      readonly type: "branch-group";
      readonly local: VcsCommitGraphRef;
      readonly remotes: ReadonlyArray<{
        readonly ref: VcsCommitGraphRef;
        readonly remoteName: string;
      }>;
    };

function splitRemoteBranch(
  ref: VcsCommitGraphRef,
): { readonly branchName: string; readonly remoteName: string } | null {
  if (ref.kind !== "remote") return null;
  const separatorIndex = ref.name.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === ref.name.length - 1) return null;
  return {
    remoteName: ref.name.slice(0, separatorIndex),
    branchName: ref.name.slice(separatorIndex + 1),
  };
}

/** Hides textual HEAD and joins matching local/remote refs without dropping identity. */
export function buildGitGraphRefBadges(
  refs: ReadonlyArray<VcsCommitGraphRef>,
): ReadonlyArray<GitGraphRefBadge> {
  const visible = refs.filter((ref) => ref.kind !== "head").map((ref, index) => ({ ref, index }));
  const remotesByBranch = new Map<
    string,
    Array<{ readonly ref: VcsCommitGraphRef; readonly index: number; readonly remoteName: string }>
  >();
  for (const entry of visible) {
    const remote = splitRemoteBranch(entry.ref);
    if (!remote) continue;
    const matches = remotesByBranch.get(remote.branchName) ?? [];
    matches.push({ ...entry, remoteName: remote.remoteName });
    remotesByBranch.set(remote.branchName, matches);
  }

  const groupedRemoteIndexes = new Set<number>();
  const badges: Array<{
    readonly badge: GitGraphRefBadge;
    readonly current: boolean;
    readonly priority: number;
    readonly index: number;
  }> = [];
  for (const entry of visible) {
    if (entry.ref.kind !== "branch") continue;
    const remotes = remotesByBranch.get(entry.ref.name) ?? [];
    if (remotes.length === 0) continue;
    for (const remote of remotes) groupedRemoteIndexes.add(remote.index);
    badges.push({
      badge: {
        type: "branch-group",
        local: entry.ref,
        remotes: remotes.map(({ ref, remoteName }) => ({ ref, remoteName })),
      },
      current: entry.ref.current,
      priority: REF_PRIORITY.branch,
      index: entry.index,
    });
  }
  for (const entry of visible) {
    if (entry.ref.kind === "remote" && groupedRemoteIndexes.has(entry.index)) continue;
    if (entry.ref.kind === "branch" && (remotesByBranch.get(entry.ref.name)?.length ?? 0) > 0) {
      continue;
    }
    badges.push({
      badge: { type: "ref", ref: entry.ref },
      current: entry.ref.current,
      priority: REF_PRIORITY[entry.ref.kind],
      index: entry.index,
    });
  }
  return badges
    .sort(
      (left, right) =>
        Number(right.current) - Number(left.current) ||
        left.priority - right.priority ||
        left.index - right.index,
    )
    .map(({ badge }) => badge);
}
