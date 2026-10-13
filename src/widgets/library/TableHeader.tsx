import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useColumnsStore } from "@/store/columns";
import {
  COLUMN_IDS,
  COLUMNS,
  type ColumnId,
  type ColumnState,
  type ViewId,
  autoSizeColumn,
  moveColumn,
  resizeColumn,
  setColumnHidden,
  shiftColumn,
  toggleSort,
} from "./columns";

/** Ctrl+Left and Ctrl+Right resize the focused column by this much (AX-1). */
export const RESIZE_STEP = 8;
/** A header drag starts after this many px, so a plain click still sorts (UD10). */
const DRAG_THRESHOLD = 4;
/** Cell padding added to the measured content width (px-2 on both sides). */
const CELL_PADDING = 16;

/**
 * The width a column needs for the rendered cells and its header (TB-3). Rows outside the
 * rendered window are not loaded (D14), so they do not count (UK5).
 */
export function measureColumn(grid: Element | null, id: ColumnId): number {
  if (!grid) return COLUMNS[id].min;
  let widest = 0;
  for (const cell of grid.querySelectorAll(`[data-col="${id}"]`)) {
    for (const child of cell.children) widest = Math.max(widest, (child as HTMLElement).scrollWidth);
  }
  return widest + CELL_PADDING;
}

interface HeaderProps {
  view: ViewId;
  state: ColumnState;
  columns: readonly ColumnId[];
  template: string;
  /** Down from the header: the rows take focus. */
  onFocusBody: () => void;
}

/**
 * The sort state of a column: its direction and its key number (1 or 2, TB-13). `aria-sort` goes on
 * the first key's header only (ARIA: one sorted column at a time); the second shows a badge.
 */
function sortOf(state: ColumnState, id: ColumnId): { direction: "ascending" | "descending" | "none"; rank: number } {
  const rank = state.sort.findIndex((entry) => entry.column === id);
  if (rank === -1) return { direction: "none", rank: 0 };
  return { direction: state.sort[rank].descending ? "descending" : "ascending", rank: rank + 1 };
}

/**
 * The Songs table header (UD8, UD9, TB-2 to TB-8): a sticky row of column headers. A click
 * sorts, a drag of the divider resizes and a double-click on it auto-sizes, a drag of a header
 * reorders, and the right-click menu shows or hides columns. Keyboard: the header row is one Tab
 * stop with roving focus; Left and Right move, Home and End go to the ends, Enter or Space sorts,
 * Shift+Left and Shift+Right reorder, Ctrl+Left and Ctrl+Right resize, Shift+F10 or the context
 * key opens the menu, and Down goes to the rows.
 */
export function TableHeader({ view, state, columns, template, onFocusBody }: HeaderProps) {
  const update = useColumnsStore((store) => store.update);
  const resetView = useColumnsStore((store) => store.resetView);
  const change = (next: (current: ColumnState) => ColumnState) => update(view, next);
  const rowRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  const [menu, setMenu] = useState<{ id: ColumnId; anchor: HTMLElement } | null>(null);
  /** The x of the drop line in the header row while a header drag is on, else null. */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const dragged = useRef(false);
  const focusedIndex = Math.min(focused, columns.length - 1);

  const cells = () => [...(rowRef.current?.querySelectorAll<HTMLElement>("[role='columnheader']") ?? [])];
  /**
   * Focuses a header cell. A plain move focuses at once, so a fast second key acts on the new
   * cell; after a reorder or a closed menu the cell gets focus once React has rendered.
   */
  const focusCell = (index: number, later = false) => {
    const target = Math.max(0, Math.min(columns.length - 1, index));
    setFocused(target);
    if (later) requestAnimationFrame(() => cells()[target]?.focus());
    else cells()[target]?.focus();
  };
  const grid = () => rowRef.current?.closest("[role='grid']") ?? null;
  const autoSize = (id: ColumnId) => change((current) => autoSizeColumn(current, id, measureColumn(grid(), id)));
  const autoSizeAll = () =>
    change((current) => columns.reduce((next, id) => autoSizeColumn(next, id, measureColumn(grid(), id)), current));
  const openMenu = (id: ColumnId, anchor: HTMLElement) => setMenu({ id, anchor });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number, id: ColumnId) => {
    // The grid's own keys (row moves) must not see header keys.
    event.stopPropagation();
    const key = event.key;
    if ((key === "F10" && event.shiftKey) || key === "ContextMenu") {
      event.preventDefault();
      openMenu(id, event.currentTarget);
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      const step = key === "ArrowLeft" ? -1 : 1;
      if (event.ctrlKey) change((current) => resizeColumn(current, id, current.widths[id] + step * RESIZE_STEP));
      else if (event.shiftKey) {
        change((current) => shiftColumn(current, id, step));
        focusCell(index + (COLUMNS[id].fixed || COLUMNS[columns[index + step]]?.fixed ? 0 : step), true);
      } else focusCell(index + step);
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      focusCell(key === "Home" ? 0 : columns.length - 1);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      change((current) => toggleSort(current, id, event.shiftKey));
    } else if (key === "ArrowDown") {
      event.preventDefault();
      onFocusBody();
    }
  };

  /** Header drag reorder with pointer events (UD10): a line marks the drop place. */
  const startReorder = (event: React.PointerEvent<HTMLDivElement>, id: ColumnId) => {
    if (event.button !== 0 || COLUMNS[id].fixed) return;
    const startX = event.clientX;
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    dragged.current = false;
    const target = (x: number) => {
      const boxes = cells().map((cell) => cell.getBoundingClientRect());
      const index = boxes.findIndex((box) => x < box.left + box.width / 2);
      return Math.max(1, index === -1 ? boxes.length : index);
    };
    const lineAt = (index: number) => {
      const cell = cells()[index];
      return cell ? cell.offsetLeft : (rowRef.current?.scrollWidth ?? 0);
    };
    const move = (moveEvent: PointerEvent) => {
      if (!dragged.current && Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD) return;
      dragged.current = true;
      setDropAt(lineAt(target(moveEvent.clientX)));
    };
    const end = (endEvent: PointerEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
      setDropAt(null);
      if (!dragged.current || endEvent.type === "pointercancel") return;
      const visibleIndex = target(endEvent.clientX);
      // The order index of the column now at that visible place, or the end.
      const anchor = columns[visibleIndex];
      change((current) => {
        const rest = current.order.filter((other) => other !== id);
        return moveColumn(current, id, anchor === undefined || anchor === id ? rest.length : rest.indexOf(anchor));
      });
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  /** Divider drag resize with pointer events (TB-2, UD10). */
  const startResize = (event: React.PointerEvent<HTMLSpanElement>, id: ColumnId) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = state.widths[id];
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) =>
      change((current) => resizeColumn(current, id, startWidth + moveEvent.clientX - startX));
    const end = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  };

  return (
    <div
      ref={rowRef}
      role="row"
      aria-rowindex={1}
      style={{ gridTemplateColumns: template }}
      className="relative grid h-full border-b bg-bg-surface text-[13px] text-text-secondary"
    >
      {columns.map((id, index) => {
        const column = COLUMNS[id];
        const { direction: sort, rank } = sortOf(state, id);
        const twoKeys = state.sort.length > 1;
        return (
          <div
            key={id}
            role="columnheader"
            aria-sort={rank === 1 ? sort : "none"}
            data-col-header={id}
            tabIndex={index === focusedIndex ? 0 : -1}
            onFocus={() => setFocused(index)}
            onKeyDown={(event) => onKeyDown(event, index, id)}
            onPointerDown={(event) => startReorder(event, id)}
            onClick={(event) => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              change((current) => toggleSort(current, id, event.shiftKey));
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              openMenu(id, event.currentTarget);
            }}
            className={cn(
              "relative flex min-w-0 cursor-default items-center gap-1 px-2 select-none hover:text-text-primary focus-visible:-outline-offset-2",
              column.align === "right" && "justify-end",
              sort !== "none" && "text-text-primary",
            )}
          >
            <span className="truncate">{column.label}</span>
            {sort !== "none" && (
              <Icon name={sort === "ascending" ? "sortUp" : "sortDown"} className="size-3.5 shrink-0" />
            )}
            {sort !== "none" && twoKeys && (
              <span data-slot="sort-rank" className="tabular text-xs text-text-muted">
                {rank}
                <span className="sr-only">{rank === 1 ? " (first sort)" : " (second sort)"}</span>
              </span>
            )}
            <span
              aria-hidden="true"
              data-slot="column-divider"
              title="Drag to resize; double-click to fit the rows in view"
              onPointerDown={(event) => startResize(event, id)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => {
                event.stopPropagation();
                autoSize(id);
              }}
              className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize after:absolute after:top-1 after:bottom-1 after:left-1/2 after:w-px after:bg-border-default hover:after:bg-border-strong"
            />
          </div>
        );
      })}
      <div aria-hidden="true" />
      {dropAt !== null && (
        <span
          aria-hidden="true"
          data-slot="column-drop"
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-brand-red"
          style={{ left: dropAt }}
        />
      )}
      <DropdownMenu
        open={menu !== null}
        onOpenChange={(open) => {
          if (open) return;
          const index = menu ? columns.indexOf(menu.id) : focusedIndex;
          setMenu(null);
          focusCell(index, true);
        }}
      >
        <DropdownMenuContent anchor={menu?.anchor} align="start" className="w-56">
          {menu && (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Columns</DropdownMenuLabel>
                {COLUMN_IDS.map((id) => (
                  <DropdownMenuCheckboxItem
                    key={id}
                    checked={!state.hidden.includes(id)}
                    disabled={!COLUMNS[id].hideable}
                    onCheckedChange={(checked) => change((current) => setColumnHidden(current, id, !checked))}
                  >
                    {COLUMNS[id].id === "track" ? "# (track number)" : COLUMNS[id].label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => autoSize(menu.id)}>Auto size column</DropdownMenuItem>
              <DropdownMenuItem onClick={autoSizeAll}>Auto size all columns</DropdownMenuItem>
              <DropdownMenuItem
                disabled={COLUMNS[menu.id].fixed}
                onClick={() => change((current) => shiftColumn(current, menu.id, -1))}
              >
                Move left
                <DropdownMenuShortcut>Shift+←</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={COLUMNS[menu.id].fixed}
                onClick={() => change((current) => shiftColumn(current, menu.id, 1))}
              >
                Move right
                <DropdownMenuShortcut>Shift+→</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => resetView(view)}>Reset columns</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="leading-snug font-normal">
                  Enter sorts; Shift+Enter or Shift+click adds a second sort. Ctrl+← and Ctrl+→ resize. Down goes to the
                  songs. Auto size fits the rows in view.
                </DropdownMenuLabel>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
