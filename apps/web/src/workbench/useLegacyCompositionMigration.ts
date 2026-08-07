import type { AgentTarget } from "./model";
import type { EnvironmentId, ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { useProject, useServerConfigs } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { worktreeInventoryEnvironment } from "~/state/worktrees";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "~/terminalUiStateStore";

import { migrateVisibleLegacyComposition, resolveLegacyWorkbenchScope } from "./legacyMigration";
import { workbenchNavigation } from "./store";

export function useLegacyCompositionMigration(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId | null;
  readonly target: AgentTarget | null;
  readonly title: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly projectId: ProjectId | null;
}) {
  const project = useProject(
    input.projectId && input.environmentId
      ? { environmentId: input.environmentId, projectId: input.projectId }
      : null,
  );
  const serverConfigs = useServerConfigs();
  const supportsWorktreeInventory =
    input.environmentId !== null &&
    serverConfigs.get(input.environmentId)?.environment.capabilities.worktreeInventory === true;
  const inventory = useEnvironmentQuery(
    input.enabled && project !== null && input.environmentId !== null && supportsWorktreeInventory
      ? worktreeInventoryEnvironment.inventory({
          environmentId: input.environmentId,
          input: {
            cwd: project.workspaceRoot,
            supportsCompleteInventory: true,
          },
        })
      : null,
  );
  const rightPanel = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, input.threadRef),
  );
  const terminal = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, input.threadRef),
  );

  useEffect(() => {
    if (
      !input.enabled ||
      project === null ||
      input.environmentId === null ||
      input.target === null
    ) {
      return;
    }
    if (supportsWorktreeInventory && inventory.data === null && inventory.error === null) return;
    const scope = resolveLegacyWorkbenchScope({
      environmentId: input.environmentId,
      workspaceRoot: project.workspaceRoot,
      inventory: inventory.data?.data ?? null,
    });
    migrateVisibleLegacyComposition({
      navigation: workbenchNavigation,
      scope,
      target: input.target,
      title: input.title,
      threadRef: input.threadRef,
      project,
      rightPanel,
      terminal,
    });
  }, [
    input.enabled,
    input.environmentId,
    input.target,
    input.threadRef,
    input.title,
    inventory.data,
    inventory.error,
    project,
    rightPanel,
    supportsWorktreeInventory,
    terminal,
  ]);
}
