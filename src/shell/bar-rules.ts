import type { DockNode } from "./clamp";

/**
 * Bar widgets (R29.1): Transport controls and Now playing. They keep a fixed height (D57), dock
 * only on top and bottom edges, may share one row with each other and never join a tab group (D58).
 */
export const BAR_WIDGETS = ["transport", "nowPlaying"] as const;
export type BarWidgetId = (typeof BAR_WIDGETS)[number];

/** The widget header (tab bar) height, part of each bar height (D57). */
export const BAR_HEADER_HEIGHT = 32;

/** Content height before the first measurement: the P17 value (plan section 2.1, P17 note N2). */
const DEFAULT_CONTENT_HEIGHT = 80;

export function isBarWidget(id: string): id is BarWidgetId {
  return (BAR_WIDGETS as readonly string[]).includes(id);
}

export type DropPosition = "top" | "bottom" | "left" | "right" | "center";

/** A drop target: the window edge, or a group with its widget ids. `paired`: the group shares a bar row. */
export type DropTarget = "window" | { widgets: string[]; paired: boolean };

/**
 * The bar drop rule (D58). A bar widget docks on a top or bottom edge, or beside the other bar
 * widget; never into a tab group. A non-bar widget never joins a bar group or docks beside it,
 * and does not split a shared bar row. Every other drop is unchanged.
 */
export function allowDrop(source: string, target: DropTarget, position: DropPosition): boolean {
  const vertical = position === "top" || position === "bottom";
  if (isBarWidget(source)) {
    if (vertical) return true;
    if (position === "center" || target === "window") return false;
    const [only] = target.widgets;
    return target.widgets.length === 1 && only !== undefined && isBarWidget(only) && only !== source;
  }
  if (target === "window" || !target.widgets.some(isBarWidget)) return true;
  return vertical && !target.paired;
}

type Orientation = "HORIZONTAL" | "VERTICAL";

function barGroup(node: DockNode): boolean {
  return node.kind === "group" && node.widgets.length === 1 && node.widgets.every(isBarWidget);
}

/**
 * The bar widgets a saved arrangement places against R29.1: in a tab group with another
 * widget, or in a row with anything but the other bar widget.
 */
export function barViolations(root: DockNode, orientation: Orientation): string[] {
  const found: string[] = [];
  // `siblings` holds the other groups of the node's row: its parent's children when that split is HORIZONTAL.
  const visit = (node: DockNode, orientation: Orientation, siblings: DockNode[]) => {
    if (node.kind === "split") {
      const next: Orientation = orientation === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
      for (const child of node.children) visit(child, next, orientation === "HORIZONTAL" ? node.children : []);
      return;
    }
    for (const id of node.widgets.filter(isBarWidget)) {
      const tabbed = node.widgets.length > 1;
      const sharedRow = siblings.some((sibling) => sibling !== node && !barGroup(sibling));
      if (tabbed || sharedRow) found.push(id);
    }
  };
  visit(root, orientation, []);
  return found;
}

/** True when the group sits in a row (HORIZONTAL split) with another group, as in a shared bar row. */
export function sharesRow(root: DockNode, orientation: Orientation, groupId: string): boolean {
  const visit = (node: DockNode, own: Orientation): boolean => {
    if (node.kind === "group") return false;
    const next: Orientation = own === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
    const here = node.children.some((child) => child.kind === "group" && child.id === groupId);
    if (here) return own === "HORIZONTAL" && node.children.length > 1;
    return node.children.some((child) => visit(child, next));
  };
  return visit(root, orientation);
}

const contentHeights: Record<BarWidgetId, number> = {
  transport: DEFAULT_CONTENT_HEIGHT,
  nowPlaying: DEFAULT_CONTENT_HEIGHT,
};
const listeners = new Set<() => void>();

/** A bar widget's fixed height: its measured content height plus the header (D57). */
export function barHeight(id: BarWidgetId): number {
  return contentHeights[id] + BAR_HEADER_HEIGHT;
}

/** Records a measured content height. Listeners hear only a change. */
export function setBarContentHeight(id: BarWidgetId, height: number): void {
  const rounded = Math.ceil(height);
  if (rounded <= 0 || rounded === contentHeights[id]) return;
  contentHeights[id] = rounded;
  for (const listener of listeners) listener();
}

/** Calls `listener` after each bar height change. Returns the stop function. */
export function onBarHeightChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: the heights before any measurement. */
export function resetBarHeights(): void {
  for (const id of BAR_WIDGETS) contentHeights[id] = DEFAULT_CONTENT_HEIGHT;
}

/**
 * True when the widget sits in the bottom bar (R29 default arrangement): the last row of a
 * VERTICAL root, alone or in a row of bar groups.
 */
export function inBottomBar(root: DockNode, orientation: Orientation, widget: string): boolean {
  // Dockview can wrap the grid in a one-child branch of the other orientation.
  while (root.kind === "split" && root.children.length === 1 && root.children[0]) {
    root = root.children[0];
    orientation = orientation === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";
  }
  if (root.kind !== "split" || orientation !== "VERTICAL") return false;
  const last = root.children.at(-1);
  if (!last) return false;
  const row = last.kind === "group" ? [last] : last.children;
  return row.every(barGroup) && row.some((node) => node.kind === "group" && node.widgets[0] === widget);
}
