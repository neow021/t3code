import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { machineScope, type WorkspaceScope } from "./model";
import type { createWorkbenchNavigation } from "./navigation";

export type WorkbenchNavigation = ReturnType<typeof createWorkbenchNavigation>;

/** Resource routes are intents. Revealing them changes Workbench focus without
    writing browser history; route replacement remains the shell's concern. */
export function revealThreadRoute(
  navigation: WorkbenchNavigation,
  input: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
    readonly title: string;
    readonly scope?: WorkspaceScope;
  },
) {
  return navigation.revealAgent({
    scope: input.scope ?? machineScope(input.environmentId),
    target: { kind: "thread", threadId: input.threadId },
    title: input.title,
  });
}

export function revealDraftRoute(
  navigation: WorkbenchNavigation,
  input: {
    readonly environmentId: EnvironmentId;
    readonly draftId: string;
    readonly scope?: WorkspaceScope;
  },
) {
  return navigation.revealAgent({
    scope: input.scope ?? machineScope(input.environmentId),
    target: { kind: "draft", draftId: input.draftId },
    title: "New thread",
  });
}

export function upstreamThreadSharePath(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}): string {
  return `/${encodeURIComponent(input.environmentId)}/${encodeURIComponent(input.threadId)}`;
}
