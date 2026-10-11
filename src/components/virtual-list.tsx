import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface VirtualListProps {
  count: number;
  rowHeight: number;
  /** Accessible name of the list. */
  label: string;
  role: "listbox" | "tree";
  /** Renders row `index`. The row must apply `style`, which positions it. */
  renderRow: (index: number, style: CSSProperties) => ReactNode;
  /** Called with the rendered index range, so the caller can fetch rows for it (D14). */
  onRange?: (start: number, end: number) => void;
  className?: string;
}

/** A virtualized list: only the rows in view and a small overscan are in the DOM. */
export function VirtualList({ count, rowHeight, label, role, renderRow, onRange, className }: VirtualListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- the app does not use the React Compiler.
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  const start = items[0]?.index ?? 0;
  const end = items.at(-1)?.index ?? -1;
  useEffect(() => {
    if (end >= start) onRange?.(start, end);
  }, [start, end, onRange]);
  return (
    <div
      ref={scrollRef}
      role={role}
      aria-label={label}
      tabIndex={0}
      className={cn("min-h-0 flex-1 overflow-auto focus-visible:-outline-offset-2", className)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) =>
          renderRow(item.index, {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: rowHeight,
            transform: `translateY(${item.start}px)`,
          }),
        )}
      </div>
    </div>
  );
}
