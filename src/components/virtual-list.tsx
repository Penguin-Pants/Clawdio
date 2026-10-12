import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/** What a row needs from the list: position, id for `aria-activedescendant`, and its place. */
export interface RowFrame {
  style: CSSProperties;
  id: string;
  active: boolean;
  posinset: number;
  setsize: number;
}

interface VirtualListProps {
  count: number;
  rowHeight: number;
  /** Accessible name of the list. */
  label: string;
  role: "listbox" | "tree";
  /** Renders row `index`. The row must apply the frame: style, id and ARIA place. */
  renderRow: (index: number, frame: RowFrame) => ReactNode;
  /** The row that has keyboard focus inside the list, or null (the default). */
  activeIndex?: number | null;
  /** Up, Down, Home, End, Page Up and Page Down move the active row (R25). */
  onMove?: (index: number) => void;
  /** The ARIA place of a row; lists use their own index, trees their place among siblings. */
  place?: (index: number) => { posinset: number; setsize: number };
  /** Called with the rendered index range, so the caller can fetch rows for it (D14). */
  onRange?: (start: number, end: number) => void;
  /** Keys that the list does not use for moving (Enter, Left, Right, the context menu keys). */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
}

/** Rows rendered above and below the view. */
const OVERSCAN = 8;

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
  className,
}: VirtualListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const rowId = (index: number) => `${baseId}-row-${index}`;
  const active = activeIndex !== null && activeIndex < count ? activeIndex : null;
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
  });
  const items = virtualizer.getVirtualItems();
  // Rows to load: the range in view and the overscan, not the kept active row.
  const range = virtualizer.range;
  const start = range ? Math.max(0, range.startIndex - OVERSCAN) : 0;
  const end = range ? Math.min(count - 1, range.endIndex + OVERSCAN) : -1;
  useEffect(() => {
    if (end >= start) onRange?.(start, end);
  }, [start, end, onRange]);
  return (
    <div
      ref={scrollRef}
      role={role}
      aria-label={label}
      aria-activedescendant={active === null ? undefined : rowId(active)}
      tabIndex={0}
      onKeyDown={(event) => {
        // A page is the rows in view, less one, so one row stays as context.
        const page = Math.max(1, Math.floor(event.currentTarget.clientHeight / rowHeight) - 1);
        const target = moveTarget(event.key, active, count, page);
        if (target !== null && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          virtualizer.scrollToIndex(target, { align: "auto" });
          onMove?.(target);
          return;
        }
        onKeyDown?.(event);
      }}
      className={cn("group/list min-h-0 flex-1 overflow-auto focus-visible:-outline-offset-2", className)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) =>
          renderRow(item.index, {
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: rowHeight,
              transform: `translateY(${item.start}px)`,
            },
            id: rowId(item.index),
            active: item.index === active,
            ...(place?.(item.index) ?? { posinset: item.index + 1, setsize: count }),
          }),
        )}
      </div>
    </div>
  );
}
