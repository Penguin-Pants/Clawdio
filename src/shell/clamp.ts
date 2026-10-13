import type { DockviewApi, SerializedDockview } from "dockview-react";
import { barHeight, isBarWidget } from "./bar-rules";
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
    height = Math.max(height, isBarWidget(id) ? barHeight(id) : WIDGETS[id].minHeight);
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

function isBarGroup(group: GroupNode): boolean {
  return group.widgets.some(isBarWidget);
}

/**
 * The fixed height of each bar group (D57). Bar groups in one row take the larger value, so
 * the row can hold both locks.
 */
function barHeights(root: DockNode, orientation: Orientation): Map<string, number> {
  const result = new Map<string, number>();
  const visit = (node: DockNode, own: Orientation) => {
    if (node.kind === "group") {
      if (isBarGroup(node)) result.set(node.id, groupMinimum(node.widgets).height);
      return;
    }
    const next: Orientation = own === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
    for (const child of node.children) visit(child, next);
    const row = node.children.filter((child): child is GroupNode => child.kind === "group" && isBarGroup(child));
    if (own === "HORIZONTAL" && row.length > 1) {
      const tallest = Math.max(...row.map((group) => result.get(group.id) ?? 0));
      for (const group of row) result.set(group.id, tallest);
    }
  };
  visit(root, orientation);
  return result;
}

/** Group sizes after the clamp. `maxHeight` is set for bar groups only (D57). */
export interface Limits extends Size {
  maxHeight?: number;
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
 * The D45 clamp with bar widgets (D59). Widths go down in proportion. Heights: non-bar groups
 * go down first; bar groups keep their fixed height (D57) until the non-bar groups reach the
 * floor, then the minimum and maximum of each bar go down together. Nothing goes below
 * CLAMP_FLOOR. Returns the limits per group id.
 */
export function clampMinimums(root: DockNode, orientation: Orientation, dock: Size): Map<string, Limits> {
  const bars = barHeights(root, orientation);
  const scaled = (value: number, factor: number) => Math.max(CLAMP_FLOOR, Math.floor(value * factor));
  const heightWith = (other: number, bar: number) => (group: GroupNode) => {
    const fixed = bars.get(group.id);
    return fixed === undefined ? scaled(groupMinimum(group.widgets).height, other) : scaled(fixed, bar);
  };
  const fits = (other: number, bar: number) =>
    dock.height <= 0 || nodeMinimum(root, orientation, heightWith(other, bar)).height <= dock.height;
  const otherFactor = largestFactor((factor) => fits(factor, 1));
  const barFactor = otherFactor > 0 || fits(0, 1) ? 1 : largestFactor((factor) => fits(0, factor));
  const required = nodeMinimum(root, orientation).width;
  const widthFactor = required > dock.width && dock.width > 0 ? dock.width / required : 1;
  const height = heightWith(otherFactor, barFactor);
  const result = new Map<string, Limits>();
  for (const group of groups(root)) {
    const width = scaled(groupMinimum(group.widgets).width, widthFactor);
    const limits: Limits = { width, height: height(group) };
    if (bars.has(group.id)) limits.maxHeight = limits.height;
    result.set(group.id, limits);
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
  for (const [id, limits] of minimums) {
    const group = api.getGroup(id);
    if (!group) continue;
    // A group that is no bar group loses any old lock (a widget moved out of it).
    const maximumHeight = limits.maxHeight ?? Number.MAX_SAFE_INTEGER;
    if (
      group.minimumWidth !== limits.width ||
      group.minimumHeight !== limits.height ||
      group.maximumHeight !== maximumHeight
    ) {
      group.api.setConstraints({ minimumWidth: limits.width, minimumHeight: limits.height, maximumHeight });
      changed = true;
    }
  }
  if (changed) api.layout(api.width, api.height, true);
}
