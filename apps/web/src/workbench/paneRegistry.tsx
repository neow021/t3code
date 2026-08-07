import type { ReactNode } from "react";

import type { PaneDescriptor } from "./model";

export type PaneKind = PaneDescriptor["kind"];
export const DEFAULT_PANE_KINDS = [
  "agent",
  "terminal",
  "files",
  "diff",
  "git-graph",
  "browser",
] as const satisfies ReadonlyArray<PaneKind>;

export interface PaneAdapterRenderProps {
  readonly pane: PaneDescriptor;
  readonly active: boolean;
}

export interface PaneAdapter {
  readonly kind: PaneKind;
  readonly render: (props: PaneAdapterRenderProps) => ReactNode;
}

export class PaneRegistry {
  readonly #adapters: ReadonlyMap<PaneKind, PaneAdapter>;

  constructor(adapters: ReadonlyArray<PaneAdapter>) {
    const byKind = new Map<PaneKind, PaneAdapter>();
    for (const adapter of adapters) {
      if (byKind.has(adapter.kind)) throw new Error(`Duplicate Pane adapter: ${adapter.kind}`);
      byKind.set(adapter.kind, adapter);
    }
    this.#adapters = byKind;
  }

  get(kind: PaneKind): PaneAdapter | null {
    return this.#adapters.get(kind) ?? null;
  }

  render(pane: PaneDescriptor, active: boolean): ReactNode | null {
    const adapter = this.get(pane.kind);
    return adapter === null ? null : adapter.render({ pane, active });
  }
}
