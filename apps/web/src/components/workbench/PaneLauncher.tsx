import { FileDiff, Files, GitMerge, SquareTerminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { useProjects } from "~/state/entities";
import type { WorkspaceScope } from "~/workbench/model";
import { workbenchNavigation } from "~/workbench/store";
import { useTerminalPaneRuntimeStore } from "~/workbench/terminalPaneRuntimeStore";

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}

function pathIsWithin(path: string, parent: string): boolean {
  const candidate = normalizedPath(path);
  const root = normalizedPath(parent);
  return candidate === root || candidate.startsWith(`${root}/`);
}

export function PaneLauncher({
  scope,
  onOpened,
}: {
  readonly scope: WorkspaceScope;
  readonly onOpened?: () => void;
}) {
  const projects = useProjects();
  const candidates = useMemo(
    () =>
      projects.filter(
        (project) =>
          project.environmentId === scope.environmentId &&
          (scope.kind === "machine" ||
            pathIsWithin(project.workspaceRoot, scope.canonicalWorktreePath)),
      ),
    [projects, scope],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const project =
    candidates.find((candidate) => candidate.id === selectedProjectId) ?? candidates[0] ?? null;

  useEffect(() => {
    if (project !== null && project.id !== selectedProjectId) setSelectedProjectId(project.id);
  }, [project, selectedProjectId]);

  const cwd =
    scope.kind === "worktree" ? scope.canonicalWorktreePath : (project?.workspaceRoot ?? null);
  const openTerminal = () => {
    if (cwd === null) return;
    const paneId = workbenchNavigation.revealTerminal({
      scope,
      cwd,
      worktreePath: scope.kind === "worktree" ? scope.canonicalWorktreePath : null,
      threadId: null,
    });
    useTerminalPaneRuntimeStore.getState().requestLaunch(paneId);
    onOpened?.();
  };

  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium">Open a Pane</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Panes live in this Window. Machine, Repo, and Worktree navigation stays in the Sidebar.
        </p>

        {candidates.length > 1 ? (
          <label className="mt-4 block text-[11px] font-medium text-muted-foreground">
            Project root
            <select
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              value={project?.id ?? ""}
              onChange={(event) => setSelectedProjectId(event.currentTarget.value)}
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title} — {candidate.workspaceRoot}
                </option>
              ))}
            </select>
          </label>
        ) : project !== null ? (
          <p className="mt-4 truncate rounded-md bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            {project.workspaceRoot}
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="justify-start"
            disabled={project === null}
            onClick={() => {
              if (project === null) return;
              workbenchNavigation.revealFiles({
                scope,
                projectId: project.id,
                rootPath: project.workspaceRoot,
              });
              onOpened?.();
            }}
          >
            <Files className="size-4" /> Files
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={cwd === null}
            onClick={openTerminal}
          >
            <SquareTerminal className="size-4" /> Terminal
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={scope.kind !== "worktree"}
            onClick={() => {
              if (scope.kind !== "worktree") return;
              workbenchNavigation.revealDiff({
                scope,
                target: {
                  kind: "worktree",
                  repositoryKey: scope.repositoryKey,
                  canonicalWorktreePath: scope.canonicalWorktreePath,
                },
              });
              onOpened?.();
            }}
          >
            <FileDiff className="size-4" /> Changes
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            disabled={scope.kind !== "worktree"}
            onClick={() => {
              if (scope.kind !== "worktree") return;
              workbenchNavigation.revealGitGraph({
                scope,
                repositoryKey: scope.repositoryKey,
                canonicalWorktreePath: scope.canonicalWorktreePath,
              });
              onOpened?.();
            }}
          >
            <GitMerge className="size-4" /> Git Graph
          </Button>
        </div>
        {scope.kind === "machine" && candidates.length === 0 ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Attach a project to this Machine before opening Files or Terminal.
          </p>
        ) : null}
        <p className="mt-4 text-[11px] text-muted-foreground">
          Agent and Browser Panes are opened from a thread so their server identity stays canonical.
        </p>
      </div>
    </div>
  );
}
