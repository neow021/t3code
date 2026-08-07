import type { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { activeWindow, emptyWorkbenchState, machineScope, type WorkspaceScope } from "./model";
import { WORKBENCH_STORAGE_KEY, useWorkbenchStore, workbenchNavigation } from "./store";

const scope: WorkspaceScope = {
  kind: "machine",
  environmentId: "env-a" as EnvironmentId,
};

describe("Workbench store interface", () => {
  beforeEach(() => {
    useWorkbenchStore.getState().reset();
  });

  it("routes mutations through the model command seam", () => {
    useWorkbenchStore.getState().dispatch({
      kind: "open-window",
      window: {
        id: "machine",
        scope,
        title: "Machine",
        layout: null,
        activePaneId: null,
      },
    });

    expect(activeWindow(useWorkbenchStore.getState())?.id).toBe("machine");
  });

  it("resets durable state without removing store actions", () => {
    useWorkbenchStore.getState().dispatch({ kind: "select-scope", scope });
    useWorkbenchStore.getState().reset();

    expect(useWorkbenchStore.getState()).toMatchObject(emptyWorkbenchState());
    expect(useWorkbenchStore.getState().dispatch).toBeTypeOf("function");
  });

  it("writes v2 under a new key instead of dual-writing foundation v1", () => {
    expect(WORKBENCH_STORAGE_KEY).toBe("t3code:workbench-state:v2");
    expect(machineScope(scope.environmentId)).toEqual(scope);
  });

  it("exposes one navigation owner over the durable store", () => {
    const windowId = workbenchNavigation.selectScope(scope);

    expect(activeWindow(useWorkbenchStore.getState())?.id).toBe(windowId);
  });
});
