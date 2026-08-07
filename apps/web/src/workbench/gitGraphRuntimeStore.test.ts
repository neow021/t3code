import { describe, expect, it } from "vite-plus/test";

import type { RepositoryKey } from "./model";
import { selectGitGraphPresentation } from "./gitGraphRuntimeStore";

const REPOSITORY_KEY = "repository:environment:git-common-dir" as RepositoryKey;

describe("selectGitGraphPresentation", () => {
  it("returns a stable normalized snapshot for persisted presentation state", () => {
    const state = {
      byRepository: {
        [REPOSITORY_KEY]: {
          mode: "compact" as const,
          collapseThreshold: 8,
          preferredWidth: 240,
        },
      },
    };

    const first = selectGitGraphPresentation(state, REPOSITORY_KEY);
    const second = selectGitGraphPresentation(state, REPOSITORY_KEY);

    expect(second).toBe(first);
  });
});
