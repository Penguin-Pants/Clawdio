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

export type Orientation = "HORIZONTAL" | "VERTICAL";
type GridObject = SerializedDockview["grid"]["root"];

/** The dock tree of a serialized grid. */
export function toNode(object: GridObject): DockNode {
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
 * `heightOf` gives each group's height; the default is its own minimum.
 */
export function nodeMinimum(
  node: DockNode,
  orientation: Orientation,
  heightOf: (group: GroupNode) => number = (group) => groupMinimum(group.widgets).height,
): Size {
  if (node.kind === "group") return { width: groupMinimum(node.widgets).width, height: heightOf(node) };
  const next: Orientation = orientation === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
  const sizes = node.children.map((child) => nodeMinimum(child, next, heightOf));
  const sum = (key: keyof Size) => sizes.reduce((total, size) => total + size[key], 0);
  const max = (key: keyof Size) => Math.max(0, ...sizes.map((size) => size[key]));
  return orientation === "HORIZONTAL"
    ? { width: sum("width"), height: max("height") }
    : { width: max("width"), height: sum("height") };
}

type GroupNode = Extract<DockNode, { kind: "group" }>;

function groups(node: DockNode): GroupNode[] {
  return node.kind === "group" ? [node] : node.children.flatMap(groups);
}

const SEARCH_STEPS = 24;

/** The largest factor in [0, 1] for which `fits` holds; `fits` grows false as the factor grows. */
function largestFactor(fits: (factor: number) => boolean): number {
  if (fits(1)) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/**
 * The D45 clamp: when the minimums do not fit the dock, every group minimum goes down by one
 * factor per axis, never below CLAMP_FLOOR. Returns the minimums per group id.
 */
export function clampMinimums(root: DockNode, orientation: Orientation, dock: Size): Map<string, Size> {
  const scaled = (value: number, factor: number) => Math.max(CLAMP_FLOOR, Math.floor(value * factor));
  const heightWith = (factor: number) => (group: GroupNode) => scaled(groupMinimum(group.widgets).height, factor);
  const heightFactor = largestFactor(
    (factor) => dock.height <= 0 || nodeMinimum(root, orientation, heightWith(factor)).height <= dock.height,
  );
  const required = nodeMinimum(root, orientation).width;
  const widthFactor = required > dock.width && dock.width > 0 ? dock.width / required : 1;
  const result = new Map<string, Size>();
  for (const group of groups(root)) {
    result.set(group.id, {
      width: scaled(groupMinimum(group.widgets).width, widthFactor),
      height: heightWith(heightFactor)(group),
    });
  }
  return result;
}

/**
 * Applies the clamp to the live dock. Constraints change only when a value differs.
 */
export function applyClamp(api: DockviewApi): void {
  if (api.width <= 0 || api.height <= 0 || api.groups.length === 0) return;
  const { grid } = api.toJSON();
  const minimums = clampMinimums(toNode(grid.root), grid.orientation as Orientation, {
    width: api.width,
    height: api.height,
  });
  let changed = false;
  for (const [id, limits] of minimums) {
    const group = api.getGroup(id);
    if (!group) continue;
    if (group.minimumWidth !== limits.width || group.minimumHeight !== limits.height) {
      group.api.setConstraints({ minimumWidth: limits.width, minimumHeight: limits.height });
      changed = true;
    }
  }
  if (changed) api.layout(api.width, api.height, true);
  // Dockview caches a column's minimum width, so a widget that joins a narrower column can stay
  // below its own minimum until the next drag. Such a group grows to its minimum here (DK-2).
  for (const [id, limits] of minimums) {
    const group = api.getGroup(id);
    if (!group) continue;
    if (group.width < limits.width - 0.5) group.api.setSize({ width: limits.width });
    if (group.height < limits.height - 0.5) group.api.setSize({ height: limits.height });
  }
}
