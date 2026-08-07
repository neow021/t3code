import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";

const decodeExecutionEnvironmentDescriptor = Schema.decodeUnknownSync(
  ExecutionEnvironmentDescriptor,
);

describe("ExecutionEnvironmentDescriptor compatibility", () => {
  const baseDescriptor = {
    environmentId: "env_compatibility_test",
    label: "Test machine",
    platform: { os: "linux", arch: "x64" },
    serverVersion: "1.0.0",
  } as const;

  it("decodes older servers that do not advertise worktree inventory", () => {
    const descriptor = decodeExecutionEnvironmentDescriptor({
      ...baseDescriptor,
      capabilities: { repositoryIdentity: true },
    });

    expect(descriptor.capabilities.worktreeInventory).toBeUndefined();
    expect(descriptor.capabilities.gitCommitGraph).toBeUndefined();
  });

  it("decodes newer servers that advertise worktree inventory", () => {
    const descriptor = decodeExecutionEnvironmentDescriptor({
      ...baseDescriptor,
      capabilities: {
        repositoryIdentity: true,
        worktreeInventory: true,
        gitCommitGraph: true,
      },
    });

    expect(descriptor.capabilities.worktreeInventory).toBe(true);
    expect(descriptor.capabilities.gitCommitGraph).toBe(true);
  });
});
