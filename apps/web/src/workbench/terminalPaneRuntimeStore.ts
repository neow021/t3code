import { create } from "zustand";

import type { WorkbenchPaneId } from "./model";

interface TerminalPaneRuntimeStore {
  readonly launchRequestByPaneId: Record<WorkbenchPaneId, number | undefined>;
  readonly requestLaunch: (paneId: WorkbenchPaneId) => void;
}

/** Explicit launch intents are intentionally in-memory so reload never auto-starts a process. */
export const useTerminalPaneRuntimeStore = create<TerminalPaneRuntimeStore>((set) => ({
  launchRequestByPaneId: {},
  requestLaunch: (paneId) =>
    set((state) => ({
      launchRequestByPaneId: {
        ...state.launchRequestByPaneId,
        [paneId]: (state.launchRequestByPaneId[paneId] ?? 0) + 1,
      },
    })),
}));
