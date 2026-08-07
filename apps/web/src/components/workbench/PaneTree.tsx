import type { CSSProperties } from "react";

import type { PaneDescriptor, PaneLayoutNode, WorkbenchPaneId } from "~/workbench/model";
import type { PaneRegistry } from "~/workbench/paneRegistry";

import { PaneFrame } from "./PaneFrame";
import { UnavailablePane } from "./UnavailablePane";

function splitStyle(node: Extract<PaneLayoutNode, { type: "split" }>): CSSProperties {
  const total = (node.firstSize ?? 1) + (node.secondSize ?? 1);
  const first = `${((node.firstSize ?? 1) / total) * 100}%`;
  const second = `${((node.secondSize ?? 1) / total) * 100}%`;
  return node.direction === "vertical"
    ? { gridTemplateColumns: `minmax(0, ${first}) minmax(0, ${second})` }
    : { gridTemplateRows: `minmax(0, ${first}) minmax(0, ${second})` };
}

function PaneLeaf(props: {
  readonly paneId: WorkbenchPaneId;
  readonly panes: Readonly<Record<WorkbenchPaneId, PaneDescriptor | undefined>>;
  readonly activePaneId: WorkbenchPaneId | null;
  readonly registry: PaneRegistry;
  readonly onActivate: (paneId: WorkbenchPaneId) => void;
  readonly onClose: (paneId: WorkbenchPaneId) => void;
  readonly isPaneAvailable?: (pane: PaneDescriptor) => boolean;
}) {
  const pane = props.panes[props.paneId];
  if (pane === undefined) return null;
  const active = props.paneId === props.activePaneId;
  const content =
    props.isPaneAvailable?.(pane) === false ? null : props.registry.render(pane, active);
  return (
    <PaneFrame
      pane={pane}
      active={active}
      onActivate={() => props.onActivate(pane.id)}
      onClose={() => props.onClose(pane.id)}
    >
      {content ?? <UnavailablePane pane={pane} />}
    </PaneFrame>
  );
}

export function PaneTree(props: {
  readonly node: PaneLayoutNode;
  readonly panes: Readonly<Record<WorkbenchPaneId, PaneDescriptor | undefined>>;
  readonly activePaneId: WorkbenchPaneId | null;
  readonly registry: PaneRegistry;
  readonly onActivate: (paneId: WorkbenchPaneId) => void;
  readonly onClose: (paneId: WorkbenchPaneId) => void;
  readonly isPaneAvailable?: (pane: PaneDescriptor) => boolean;
}) {
  if (props.node.type === "leaf") {
    return <PaneLeaf {...props} paneId={props.node.paneId} />;
  }
  return (
    <div
      className="grid size-full min-h-0 min-w-0 gap-1.5"
      style={splitStyle(props.node)}
      data-split-direction={props.node.direction}
    >
      <PaneTree {...props} node={props.node.first} />
      <PaneTree {...props} node={props.node.second} />
    </div>
  );
}

export function CompactPane(props: Omit<Parameters<typeof PaneTree>[0], "node">) {
  if (props.activePaneId === null) return null;
  return <PaneLeaf {...props} paneId={props.activePaneId} />;
}
