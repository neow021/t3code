import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

import {
  DEFAULT_GIT_GRAPH_COLLAPSE_THRESHOLD,
  normalizeGitGraphCollapseThreshold,
} from "./gitGraphCompact";
import type { RepositoryKey } from "./model";

export interface GitGraphPresentation {
  readonly mode: "compact" | "full";
  readonly collapseThreshold: number;
  readonly preferredWidth: number | null;
}

interface GitGraphRuntimeStore {
  readonly byRepository: Record<string, GitGraphPresentation | undefined>;
  readonly setMode: (repositoryKey: RepositoryKey, mode: GitGraphPresentation["mode"]) => void;
  readonly setCollapseThreshold: (repositoryKey: RepositoryKey, threshold: number) => void;
  readonly setPreferredWidth: (repositoryKey: RepositoryKey, width: number | null) => void;
}

const DEFAULT_PRESENTATION: GitGraphPresentation = {
  mode: "compact",
  collapseThreshold: DEFAULT_GIT_GRAPH_COLLAPSE_THRESHOLD,
  preferredWidth: null,
};

export function selectGitGraphPresentation(
  state: Pick<GitGraphRuntimeStore, "byRepository">,
  repositoryKey: RepositoryKey,
): GitGraphPresentation {
  const stored = state.byRepository[repositoryKey];
  return stored === undefined
    ? DEFAULT_PRESENTATION
    : {
        ...DEFAULT_PRESENTATION,
        ...stored,
        collapseThreshold: normalizeGitGraphCollapseThreshold(stored.collapseThreshold),
        preferredWidth:
          typeof stored.preferredWidth === "number" && Number.isFinite(stored.preferredWidth)
            ? Math.min(720, Math.max(72, Math.round(stored.preferredWidth)))
            : null,
      };
}

export const useGitGraphRuntimeStore = create<GitGraphRuntimeStore>()(
  persist(
    (set) => ({
      byRepository: {},
      setMode: (repositoryKey, mode) =>
        set((state) => ({
          byRepository: {
            ...state.byRepository,
            [repositoryKey]: {
              ...(state.byRepository[repositoryKey] ?? DEFAULT_PRESENTATION),
              mode,
            },
          },
        })),
      setCollapseThreshold: (repositoryKey, threshold) =>
        set((state) => ({
          byRepository: {
            ...state.byRepository,
            [repositoryKey]: {
              ...(state.byRepository[repositoryKey] ?? DEFAULT_PRESENTATION),
              collapseThreshold: normalizeGitGraphCollapseThreshold(threshold),
            },
          },
        })),
      setPreferredWidth: (repositoryKey, width) =>
        set((state) => ({
          byRepository: {
            ...state.byRepository,
            [repositoryKey]: {
              ...(state.byRepository[repositoryKey] ?? DEFAULT_PRESENTATION),
              preferredWidth:
                width === null ? null : Math.min(720, Math.max(72, Math.round(width))),
            },
          },
        })),
    }),
    {
      name: "t3code:workbench-git-graph-runtime:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byRepository: state.byRepository }),
    },
  ),
);
