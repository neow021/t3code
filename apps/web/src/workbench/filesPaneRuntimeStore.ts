import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import type { WorkbenchPaneId } from "./model";

export interface FilesPaneRuntimeState {
  readonly relativePath: string | null;
  readonly revealLine: number | null;
  readonly revealRequestId: number;
}

interface FilesPaneRuntimeStore {
  readonly byPaneId: Record<WorkbenchPaneId, FilesPaneRuntimeState | undefined>;
  readonly openFile: (paneId: WorkbenchPaneId, relativePath: string, line?: number) => void;
  readonly clearPane: (paneId: WorkbenchPaneId) => void;
}

const DEFAULT_FILES_PANE_STATE: FilesPaneRuntimeState = {
  relativePath: null,
  revealLine: null,
  revealRequestId: 0,
};

function normalizeLine(line: number | undefined): number | null {
  return line === undefined || !Number.isFinite(line) ? null : Math.max(1, Math.trunc(line));
}

export function selectFilesPaneRuntimeState(
  byPaneId: FilesPaneRuntimeStore["byPaneId"],
  paneId: WorkbenchPaneId,
): FilesPaneRuntimeState {
  return byPaneId[paneId] ?? DEFAULT_FILES_PANE_STATE;
}

export const useFilesPaneRuntimeStore = create<FilesPaneRuntimeStore>()(
  persist(
    (set) => ({
      byPaneId: {},
      openFile: (paneId, relativePath, line) =>
        set((state) => {
          const normalizedPath = relativePath.trim();
          if (!normalizedPath) return state;
          const current = state.byPaneId[paneId] ?? DEFAULT_FILES_PANE_STATE;
          return {
            byPaneId: {
              ...state.byPaneId,
              [paneId]: {
                relativePath: normalizedPath,
                revealLine: normalizeLine(line),
                revealRequestId: current.revealRequestId + 1,
              },
            },
          };
        }),
      clearPane: (paneId) =>
        set((state) => {
          if (!(paneId in state.byPaneId)) return state;
          const { [paneId]: _removed, ...byPaneId } = state.byPaneId;
          return { byPaneId };
        }),
    }),
    {
      name: "t3code:workbench-files-runtime:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byPaneId: state.byPaneId }),
    },
  ),
);
