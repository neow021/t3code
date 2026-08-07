import { createWorktreeInventoryAtoms } from "@t3tools/client-runtime/state/worktrees";

import { connectionAtomRuntime } from "../connection/runtime";

export const worktreeInventoryEnvironment = createWorktreeInventoryAtoms(connectionAtomRuntime);
