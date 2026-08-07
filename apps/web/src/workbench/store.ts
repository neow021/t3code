import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import {
  WORKBENCH_STATE_VERSION,
  applyWorkbenchCommand,
  emptyWorkbenchState,
  type WorkbenchCommand,
  type WorkbenchState,
} from "./model";
import { restoreWorkbenchState } from "./persistence";
import { createWorkbenchNavigation } from "./navigation";

export const WORKBENCH_STORAGE_KEY = "t3code:workbench-state:v2";
export const WORKBENCH_QUARANTINE_STORAGE_KEY = "t3code:workbench-state:quarantine";

interface WorkbenchStoreState extends WorkbenchState {
  dispatch: (command: WorkbenchCommand) => void;
  reset: () => void;
}

function durableState(state: WorkbenchState): WorkbenchState {
  return {
    version: state.version,
    activeScope: state.activeScope,
    windowsByScope: state.windowsByScope,
    activeWindowByScope: state.activeWindowByScope,
    panes: state.panes,
  };
}

function restoreDurableState(value: unknown): WorkbenchState {
  const restored = restoreWorkbenchState(value);
  if (restored.quarantine && typeof window !== "undefined") {
    resolveStorage(window.localStorage).setItem(
      WORKBENCH_QUARANTINE_STORAGE_KEY,
      JSON.stringify(restored.quarantine),
    );
  }
  return restored.state;
}

/**
 * The only mutable entry point for Workbench ownership and layout state.
 * Surface-specific runtime state remains in the existing environment stores.
 */
export const useWorkbenchStore = create<WorkbenchStoreState>()(
  persist<WorkbenchStoreState, [], [], WorkbenchState>(
    (set) => ({
      ...emptyWorkbenchState(),
      dispatch: (command) => set((state) => durableState(applyWorkbenchCommand(state, command))),
      reset: () => set(emptyWorkbenchState()),
    }),
    {
      name: WORKBENCH_STORAGE_KEY,
      version: WORKBENCH_STATE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: durableState,
      migrate: (persistedState) => restoreDurableState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...restoreDurableState(persistedState),
      }),
    },
  ),
);

export const workbenchNavigation = createWorkbenchNavigation({
  state: {
    getState: useWorkbenchStore.getState,
    dispatch: (command) => useWorkbenchStore.getState().dispatch(command),
  },
});
