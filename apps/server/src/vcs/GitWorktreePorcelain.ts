import type { VcsWorktreeInventoryEntry } from "@t3tools/contracts";

type MutableWorktreeEntry = {
  path: string | null;
  headSha: string | null;
  branchRef: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockedReason: string | null;
  prunable: boolean;
  prunableReason: string | null;
};

function emptyEntry(): MutableWorktreeEntry {
  return {
    path: null,
    headSha: null,
    branchRef: null,
    detached: false,
    bare: false,
    locked: false,
    lockedReason: null,
    prunable: false,
    prunableReason: null,
  };
}

function optionalFieldReason(field: string, prefix: string): string | null {
  const reason = field.slice(prefix.length).trim();
  return reason.length > 0 ? reason : null;
}

/** Parses `git worktree list --porcelain -z` without treating newlines as delimiters. */
export function parseGitWorktreePorcelain(
  stdout: string,
): ReadonlyArray<VcsWorktreeInventoryEntry> {
  const entries: VcsWorktreeInventoryEntry[] = [];
  let current = emptyEntry();

  const flush = () => {
    if (current.path !== null) {
      entries.push({
        path: current.path,
        headSha: current.headSha,
        branchRef: current.branchRef,
        detached: current.detached,
        bare: current.bare,
        locked: current.locked,
        lockedReason: current.lockedReason,
        prunable: current.prunable,
        prunableReason: current.prunableReason,
      });
    }
    current = emptyEntry();
  };

  for (const field of stdout.split("\0")) {
    if (field === "") {
      flush();
    } else if (field.startsWith("worktree ")) {
      current.path = field.slice("worktree ".length);
    } else if (field.startsWith("HEAD ")) {
      current.headSha = field.slice("HEAD ".length) || null;
    } else if (field.startsWith("branch ")) {
      current.branchRef = field.slice("branch ".length) || null;
    } else if (field === "detached") {
      current.detached = true;
    } else if (field === "bare") {
      current.bare = true;
    } else if (field === "locked" || field.startsWith("locked ")) {
      current.locked = true;
      current.lockedReason = optionalFieldReason(field, "locked");
    } else if (field === "prunable" || field.startsWith("prunable ")) {
      current.prunable = true;
      current.prunableReason = optionalFieldReason(field, "prunable");
    }
  }
  flush();

  return entries;
}
