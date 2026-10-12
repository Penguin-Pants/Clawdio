import type { DockviewApi, SerializedDockview } from "dockview-react";
import { WIDGETS, isWidgetId } from "./widgets";

/** No group minimum goes below the widget header height (D45). */
export const CLAMP_FLOOR = 32;

export interface Size {
  width: number;
  height: number;
}

/** The dock tree: a leaf is a group with its widget ids; a branch splits along its orientation. */
export type DockNode = { kind: "group"; id: string; widgets: string[] } | { kind: "split"; children: DockNode[] };

type Orientation = "HORIZONTAL" | "VERTICAL";
type GridObject = SerializedDockview["grid"]["root"];

function toNode(object: GridObject): DockNode {
  if (object.type === "leaf") {
    const data = object.data as { id: string; views: string[] };
    return { kind: "group", id: data.id, widgets: data.views };
  }
  return { kind: "split", children: (object.data as GridObject[]).map(toNode) };
}

/** A group's own minimum: the largest minimum of its widgets, so every tab fits (D33). */
export function groupMinimum(widgets: string[]): Size {
  let width = CLAMP_FLOOR;
  let height = CLAMP_FLOOR;
  for (const id of widgets) {
    if (!isWidgetId(id)) continue;
    width = Math.max(width, WIDGETS[id].minWidth);
    height = Math.max(height, WIDGETS[id].minHeight);
  }
  return { width, height };
}

/**
 * The minimum size of a tree node. A HORIZONTAL split places its children side by side,
 * so widths add up and the height is the largest child height. VERTICAL is the reverse.
 */
export function nodeMinimum(node: DockNode, orientation: Orientation): Size {
  if (node.kind === "group") return groupMinimum(node.widgets);
  const next: Orientation = orientation === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
  const sizes = node.children.map((child) => nodeMinimum(child, next));
  const sum = (key: keyof Size) => sizes.reduce((total, size) => total + size[key], 0);
  const max = (key: keyof Size) => Math.max(0, ...sizes.map((size) => size[key]));
  return orientation === "HORIZONTAL"
    ? { width: sum("width"), height: max("height") }
    : { width: max("width"), height: sum("height") };
}

function groups(node: DockNode): Extract<DockNode, { kind: "group" }>[] {
  return node.kind === "group" ? [node] : node.children.flatMap(groups);
}

/**
 * The D45 clamp. When the minimums of an arrangement exceed the dock along one axis, every
 * group minimum on that axis goes down in the same proportion, never below CLAMP_FLOOR.
 * Returns the minimum size per group id.
 */
export function clampMinimums(root: DockNode, orientation: Orientation, dock: Size): Map<string, Size> {
  const required = nodeMinimum(root, orientation);
  const factor = (key: keyof Size) => (required[key] > dock[key] && dock[key] > 0 ? dock[key] / required[key] : 1);
  const widthFactor = factor("width");
  const heightFactor = factor("height");
  const result = new Map<string, Size>();
  for (const group of groups(root)) {
    const own = groupMinimum(group.widgets);
    result.set(group.id, {
      width: Math.max(CLAMP_FLOOR, Math.floor(own.width * widthFactor)),
      height: Math.max(CLAMP_FLOOR, Math.floor(own.height * heightFactor)),
    });
  }
  return result;
}

/** Applies the clamp to the live dock. Constraints change only when a value differs. */
export function applyClamp(api: DockviewApi): void {
  if (api.width <= 0 || api.height <= 0 || api.groups.length === 0) return;
  const { grid } = api.toJSON();
  const minimums = clampMinimums(toNode(grid.root), grid.orientation as Orientation, {
    width: api.width,
    height: api.height,
  });
  let changed = false;
  for (const [id, size] of minimums) {
    const group = api.getGroup(id);
    if (!group) continue;
    if (group.minimumWidth !== size.width || group.minimumHeight !== size.height) {
      group.api.setConstraints({ minimumWidth: size.width, minimumHeight: size.height });
      changed = true;
    }
  }
  if (changed) api.layout(api.width, api.height, true);
}
