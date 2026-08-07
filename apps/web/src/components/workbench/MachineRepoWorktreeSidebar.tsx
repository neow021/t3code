import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Circle, Folder, GitBranch, GitFork } from "lucide-react";
import {
  buildMachineRepoWorktreeProjection,
  type RepositoryNode,
} from "@t3tools/client-runtime/state/workspace-inventory";
import type { WorktreeInventoryView } from "@t3tools/client-runtime/state/worktrees";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { useEnvironments } from "~/state/environments";
import { useProjects, useServerConfigs } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { worktreeInventoryEnvironment } from "~/state/worktrees";
import {
  createRepositoryKey,
  createWorktreeScope,
  machineScope,
  scopeKey,
} from "~/workbench/model";
import { useWorkbenchStore, workbenchNavigation } from "~/workbench/store";

import { SidebarChromeFooter, SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { SidebarContent, SidebarGroup } from "../ui/sidebar";

type EnvironmentProject = ReturnType<typeof useProjects>[number];

function inventoryProbeKey(project: EnvironmentProject): string {
  return `${project.environmentId}:${project.workspaceRoot}`;
}

function WorktreeInventoryProbe(props: {
  readonly project: EnvironmentProject;
  readonly supportsCompleteInventory: boolean;
  readonly onChange: (key: string, value: WorktreeInventoryView | null) => void;
}) {
  const key = inventoryProbeKey(props.project);
  const inventory = useEnvironmentQuery(
    worktreeInventoryEnvironment.inventory({
      environmentId: props.project.environmentId,
      input: {
        cwd: props.project.workspaceRoot,
        supportsCompleteInventory: props.supportsCompleteInventory,
      },
    }),
  ).data;

  useEffect(() => {
    props.onChange(key, inventory);
    return () => props.onChange(key, null);
  }, [inventory, key, props.onChange]);
  return null;
}

function WorktreeRow(props: {
  readonly repository: RepositoryNode;
  readonly worktree: RepositoryNode["worktrees"][number];
  readonly activeScopeKey: string | null;
}) {
  const repositoryKey = createRepositoryKey({
    environmentId: props.repository.environmentId,
    gitCommonDirectory: props.repository.gitCommonDirectory,
  });
  const scope = createWorktreeScope({
    environmentId: props.repository.environmentId,
    repositoryKey,
    canonicalWorktreePath: props.worktree.path,
  });
  const active = props.activeScopeKey === scopeKey(scope);
  const branch =
    props.worktree.branchRef?.replace(/^refs\/heads\//, "") ??
    (props.worktree.detached ? "Detached" : props.worktree.path.split(/[\\/]/).at(-1));
  return (
    <button
      type="button"
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md pl-11 pr-2 text-left text-xs",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
      data-sidebar-node="worktree"
      data-active={active || undefined}
      onClick={() => workbenchNavigation.selectScope(scope, branch ?? "Worktree")}
    >
      <GitBranch className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{branch}</span>
      {props.worktree.locked ? (
        <span className="text-[10px] text-muted-foreground">locked</span>
      ) : null}
    </button>
  );
}

function RepositoryRows(props: {
  readonly repository: RepositoryNode;
  readonly collapsed: boolean;
  readonly activeScopeKey: string | null;
  readonly onToggle: () => void;
}) {
  return (
    <div data-sidebar-node="repository">
      <button
        type="button"
        className="flex h-8 w-full items-center gap-2 rounded-md pl-7 pr-2 text-left text-xs font-medium hover:bg-sidebar-accent/60"
        onClick={props.onToggle}
      >
        {props.collapsed ? (
          <ChevronRight className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )}
        <GitFork className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{props.repository.label}</span>
        {props.repository.stale ? (
          <span className="text-[10px] text-muted-foreground">stale</span>
        ) : null}
      </button>
      {props.collapsed
        ? null
        : props.repository.worktrees.map((worktree) => (
            <WorktreeRow
              key={worktree.key}
              repository={props.repository}
              worktree={worktree}
              activeScopeKey={props.activeScopeKey}
            />
          ))}
    </div>
  );
}

export function MachineRepoWorktreeSidebar() {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const serverConfigs = useServerConfigs();
  const activeScope = useWorkbenchStore((state) => state.activeScope);
  const activeScopeKey = activeScope === null ? null : scopeKey(activeScope);
  const [inventories, setInventories] = useState<ReadonlyMap<string, WorktreeInventoryView>>(
    () => new Map(),
  );
  const [collapsedMachines, setCollapsedMachines] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedRepositories, setCollapsedRepositories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const uniqueProjects = useMemo(() => {
    const byKey = new Map<string, EnvironmentProject>();
    for (const project of projects) byKey.set(inventoryProbeKey(project), project);
    return [...byKey.values()];
  }, [projects]);
  const handleInventoryChange = useCallback((key: string, value: WorktreeInventoryView | null) => {
    setInventories((current) => {
      if (value === null && !current.has(key)) return current;
      if (value !== null && current.get(key) === value) return current;
      const next = new Map(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }, []);
  const projection = useMemo(
    () =>
      buildMachineRepoWorktreeProjection({
        machines: environments.map((environment) => ({
          environmentId: environment.environmentId,
          label: environment.label,
          connectionPhase: environment.connection.phase,
        })),
        projects,
        inventories: [...inventories.values()],
      }),
    [environments, inventories, projects],
  );

  return (
    <>
      {uniqueProjects.map((project) => (
        <WorktreeInventoryProbe
          key={inventoryProbeKey(project)}
          project={project}
          supportsCompleteInventory={
            serverConfigs.get(project.environmentId)?.environment.capabilities.worktreeInventory ===
            true
          }
          onChange={handleInventoryChange}
        />
      ))}
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="gap-1 px-2 py-2">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Machines
          </div>
          {projection.machines.map((machine) => {
            const collapsed = collapsedMachines.has(machine.key);
            const machineScopeValue = machineScope(machine.environmentId);
            const active = activeScopeKey === scopeKey(machineScopeValue);
            return (
              <div key={machine.key} data-sidebar-node="machine">
                <div className="flex h-9 items-center gap-1 rounded-md">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent"
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${machine.label}`}
                    onClick={() =>
                      setCollapsedMachines((current) => {
                        const next = new Set(current);
                        if (next.has(machine.key)) next.delete(machine.key);
                        else next.add(machine.key);
                        return next;
                      })
                    }
                  >
                    {collapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                    onClick={() =>
                      workbenchNavigation.selectScope(machineScopeValue, machine.label)
                    }
                  >
                    <Circle
                      className={cn(
                        "size-2 shrink-0 fill-current",
                        machine.connectionPhase === "connected"
                          ? "text-emerald-500"
                          : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{machine.label}</span>
                  </button>
                </div>
                {collapsed ? null : (
                  <div>
                    {machine.repositories.map((repository) => (
                      <RepositoryRows
                        key={repository.key}
                        repository={repository}
                        collapsed={collapsedRepositories.has(repository.key)}
                        activeScopeKey={activeScopeKey}
                        onToggle={() =>
                          setCollapsedRepositories((current) => {
                            const next = new Set(current);
                            if (next.has(repository.key)) next.delete(repository.key);
                            else next.add(repository.key);
                            return next;
                          })
                        }
                      />
                    ))}
                    {machine.standaloneWorkspaces.map((workspace) => (
                      <button
                        key={workspace.key}
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-md pl-7 pr-2 text-left text-xs text-sidebar-foreground/75 hover:bg-sidebar-accent/60"
                        data-sidebar-node="workspace"
                        onClick={() =>
                          workbenchNavigation.selectScope(machineScopeValue, workspace.title)
                        }
                      >
                        <Folder className="size-3.5" />
                        <span className="truncate">{workspace.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </SidebarGroup>
      </SidebarContent>
      <SidebarChromeFooter />
    </>
  );
}
