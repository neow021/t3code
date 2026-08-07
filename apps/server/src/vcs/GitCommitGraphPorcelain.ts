import type { VcsCommitGraphCommit, VcsCommitGraphRef } from "@t3tools/contracts";

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";

function pushRef(
  refs: VcsCommitGraphRef[],
  seen: Set<string>,
  name: string,
  kind: VcsCommitGraphRef["kind"],
  current: boolean,
): void {
  const normalized = name.trim();
  const key = `${kind}:${normalized}`;
  if (!normalized || seen.has(key)) return;
  seen.add(key);
  refs.push({ name: normalized, kind, current });
}

function pushDecoratedRef(
  refs: VcsCommitGraphRef[],
  seen: Set<string>,
  raw: string,
  current: boolean,
): void {
  if (raw.startsWith("tag: refs/tags/")) {
    pushRef(refs, seen, raw.slice("tag: refs/tags/".length), "tag", current);
  } else if (raw.startsWith("refs/heads/")) {
    pushRef(refs, seen, raw.slice("refs/heads/".length), "branch", current);
  } else if (raw.startsWith("refs/remotes/")) {
    pushRef(refs, seen, raw.slice("refs/remotes/".length), "remote", current);
  } else if (raw === "HEAD") {
    pushRef(refs, seen, raw, "head", true);
  } else if (raw.startsWith("tag: ")) {
    pushRef(refs, seen, raw.slice("tag: ".length), "tag", current);
  } else {
    pushRef(refs, seen, raw, "branch", current);
  }
}

export function parseGitCommitGraphRefs(value: string): VcsCommitGraphRef[] {
  const refs: VcsCommitGraphRef[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(", ")) {
    const ref = raw.trim();
    if (!ref) continue;
    if (ref.startsWith("HEAD -> ")) {
      pushRef(refs, seen, "HEAD", "head", true);
      pushDecoratedRef(refs, seen, ref.slice("HEAD -> ".length), true);
    } else {
      pushDecoratedRef(refs, seen, ref, false);
    }
  }
  return refs;
}

/** Parses `git log --format` records produced by the graph driver. */
export function parseGitCommitGraphLog(stdout: string): VcsCommitGraphCommit[] {
  const commits: VcsCommitGraphCommit[] = [];
  for (const rawRecord of stdout.split(RECORD_SEPARATOR)) {
    const record = rawRecord.replace(/^\r?\n+|\r?\n+$/g, "");
    if (!record) continue;
    const fields = record.split(FIELD_SEPARATOR);
    if (fields.length < 8) continue;
    const [sha, shortSha, parents, authorName, authorEmail, committedAt, decorations, subject] =
      fields;
    if (!sha || !shortSha || !committedAt) continue;
    commits.push({
      sha,
      shortSha,
      parents: parents?.trim() ? parents.trim().split(/\s+/) : [],
      authorName: authorName ?? "",
      authorEmail: authorEmail ?? "",
      committedAt,
      refs: parseGitCommitGraphRefs(decorations ?? ""),
      subject: subject ?? "",
    });
  }
  return commits;
}
