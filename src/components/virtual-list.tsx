import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * What a row needs from the list: the id for `aria-activedescendant`, its index and place.
 * Primitives only, so a memo row compares equal across a re-render of the list (PF-1). The list
 * positions each row in a wrapper of its own.
 */
export interface RowFrame {
  id: string;
  index: number;
  active: boolean;
  posinset: number;
  setsize: number;
}

/** The modifier keys of a move (UD12): Shift extends from the anchor. */
export interface MoveModifiers {
  shift: boolean;
}

interface VirtualListProps {
  count: number;
  rowHeight: number;
  /** Accessible name of the list. */
  label: string;
  /** `grid` for the Songs table (UD8): rows of grid cells under a header row. */
  role: "listbox" | "tree" | "grid";
  /** Renders row `index`. The row must apply the frame id and ARIA place. */
  renderRow: (index: number, frame: RowFrame) => ReactNode;
  /** The row that has keyboard focus inside the list, or null (the default). */
  activeIndex?: number | null;
  /** Up, Down, Home, End, Page Up and Page Down move the active row (R25); Shift extends (TB-10). */
  onMove?: (index: number, modifiers: MoveModifiers) => void;
  /** The ARIA place of a row; lists use their own index, trees their place among siblings. */
  place?: (index: number) => { posinset: number; setsize: number };
  /** Called with the rendered index range, so the caller can fetch rows for it (D14). */
  onRange?: (start: number, end: number) => void;
  /** Keys that the list does not use for moving (Enter, Left, Right, the context menu keys). */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** A sticky header inside the scroll element (TB-7): it scrolls horizontally with the rows. */
  header?: ReactNode;
  /** The rows' minimum width; a narrower list scrolls horizontally (TB-7). */
  contentWidth?: number;
  /** `aria-multiselectable` (UD12). */
  multiselectable?: boolean;
  /** Each new object scrolls its row into view, with no focus change (R35.3). */
  reveal?: { index: number } | null;
  className?: string;
}

/** Rows rendered above and below the view. */
const OVERSCAN = 8;
/** Left and Right scroll a wide grid by this much (UD8). */
const SCROLL_STEP = 40;

/** The index a navigation key moves to, or null for other keys. `page` is the rows in view. */
export function moveTarget(key: string, active: number | null, count: number, page: number): number | null {
  if (count === 0) return null;
  const from = active ?? -1;
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, from + 1);
    case "ArrowUp":
      return active === null ? 0 : Math.max(0, from - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "PageDown":
      return Math.min(count - 1, Math.max(0, from) + page);
    case "PageUp":
      return Math.max(0, from - page);
    default:
      return null;
  }
}

/**
 * A virtualized list: only the rows in view, a small overscan and the active row are in the
 * DOM. The list keeps focus and points at the active row with `aria-activedescendant` (P6.6).
 * As a grid it carries `aria-rowcount` (the rows plus the header row, UD8).
 */
export function VirtualList({
  count,
  rowHeight,
  label,
  role,
  renderRow,
  activeIndex = null,
  onMove,
  place,
  onRange,
  onKeyDown,
  header,
  contentWidth,
  multiselectable,
  reveal = null,
  className,
}: VirtualListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const rowId = (index: number) => `${baseId}-row-${index}`;
  const active = activeIndex !== null && activeIndex < count ? activeIndex : null;
  const grid = role === "grid";
  // The sticky header is one row high and sits above the rows in the scroll element.
  const headerHeight = grid && header ? rowHeight : 0;
  // The active row stays rendered when it scrolls out of view, so the arrow keys move from it.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (active !== null && !indexes.includes(active)) indexes.push(active);
      return indexes.sort((a, b) => a - b);
    },
    [active],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- the app does not use the React Compiler.
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    rangeExtractor,
    scrollMargin: headerHeight,
    scrollPaddingStart: headerHeight,
  });
  useEffect(() => {
    if (reveal && reveal.index < count) virtualizer.scrollToIndex(reveal.index, { align: "auto" });
    // Only a new reveal request scrolls; a new count alone does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, virtualizer]);
  // A new row height (a root font change) measures every row again.
  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);
  const items = virtualizer.getVirtualItems();
  // Rows to load: the range in view and the overscan, not the kept active row.
  const range = virtualizer.range;
  const start = range ? Math.max(0, range.startIndex - OVERSCAN) : 0;
  const end = range ? Math.min(count - 1, range.endIndex + OVERSCAN) : -1;
  useEffect(() => {
    if (end >= start) onRange?.(start, end);
  }, [start, end, onRange]);
  const rows = items.map((item) => (
    <div
      key={item.key}
      role="presentation"
      className="absolute top-0 left-0 w-full"
      style={{ height: rowHeight, transform: `translateY(${item.start - headerHeight}px)` }}
    >
      {renderRow(item.index, {
        id: rowId(item.index),
        index: item.index,
        active: item.index === active,
        ...(place?.(item.index) ?? { posinset: item.index + 1, setsize: count }),
      })}
    </div>
  ));
  return (
    <div
      ref={scrollRef}
      role={role}
      aria-label={label}
      aria-activedescendant={active === null ? undefined : rowId(active)}
      aria-multiselectable={multiselectable || undefined}
      aria-rowcount={grid ? count + (header ? 1 : 0) : undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        // A page is the rows in view, less one, so one row stays as context.
        const page = Math.max(1, Math.floor(event.currentTarget.clientHeight / rowHeight) - 1);
        const target = moveTarget(event.key, active, count, page);
        if (target !== null && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          virtualizer.scrollToIndex(target, { align: "auto" });
          onMove?.(target, { shift: event.shiftKey });
          return;
        }
        // Cells are not focus targets: Left and Right scroll a grid that is wider than its box.
        if (grid && (event.key === "ArrowLeft" || event.key === "ArrowRight") && !event.ctrlKey) {
          event.preventDefault();
          event.currentTarget.scrollLeft += event.key === "ArrowLeft" ? -SCROLL_STEP : SCROLL_STEP;
          return;
        }
        onKeyDown?.(event);
      }}
      className={cn("group/list min-h-0 flex-1 overflow-auto focus-visible:-outline-offset-2", className)}
    >
      {grid && header && (
        <div role="rowgroup" className="sticky top-0 z-10" style={{ height: headerHeight, minWidth: contentWidth }}>
          {header}
        </div>
      )}
      <div
        role={grid ? "rowgroup" : undefined}
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize(), minWidth: contentWidth }}
      >
        {rows}
      </div>
    </div>
  );
}
