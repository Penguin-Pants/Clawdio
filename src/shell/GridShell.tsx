import { type KeyboardEvent, type PointerEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "@/components/icons";
import { commands } from "@/lib/ipc/commands";
import { cn } from "@/lib/utils";
import { markArranged } from "@/store/selection-restore";
import { useUiStore } from "@/store/ui";
import { restoreColumns, watchColumns } from "./columns-persistence";
import { GRID, type Handle, type Rect, draggedRect } from "./grid/engine";
import {
  activateWidget,
  applyMeasureLayout,
  commitRect,
  moveWidgetBy,
  previewRect,
  resizeWidgetBy,
  useGridStore,
} from "./layouts";
import { waitForPopulated } from "./measure";
import { restoreLayout, watchLayout } from "./persistence";
import { WIDGETS, type WidgetId, isWidgetId } from "./widgets";

/**
 * The arrangement at start: the measurement layout in measurement mode (not saved, P3.1), else
 * the saved layout (R38.11). Then layout changes save, and a close request writes a pending save
 * first (P9.3).
 */
async function startArrangement(): Promise<void> {
  const mode = await commands.measureMode().catch(() => null);
  if (mode) {
    applyMeasureLayout(mode);
    markArranged();
    // The measurement scripts wait for this signal before the idle period (P3.5, D28).
    waitForPopulated(async () => !(await commands.scanRunning())).then(() => commands.measureReady(), console.error);
    return;
  }
  const text = await commands.layoutLoad().catch(() => null);
  restoreLayout(text);
  const watcher = watchLayout();
  // The Songs column state is a file of its own (PS-6, UD13). The watcher starts first, so an
  // edit made while the file loads is saved too.
  const columns = watchColumns();
  await restoreColumns();
  // The saved column sort is set: a held selection restore shows its rows in their sorted
  // places (R37.3).
  markArranged();
  try {
    await getCurrentWindow().onCloseRequested(async () => {
      await Promise.all([watcher.flush(), columns.flush()]);
    });
  } catch {
    // No app window (tests outside the shell): nothing to flush on close.
  }
}

/** The CSS grid placement of a rectangle (1-based lines). */
const area = (rect: Rect) => ({
  gridColumn: `${rect.x + 1} / span ${rect.w}`,
  gridRow: `${rect.y + 1} / span ${rect.h}`,
});

/** A drag in progress: the widget, its target cells and whether the drop is allowed. */
interface Drag {
  id: WidgetId;
  rect: Rect;
  allowed: boolean;
}

/** Arrow keys move by one cell; Shift+arrow keys resize by one cell. Alt may be held too (R38.10). */
const KEY_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const ARROWS = Object.keys(KEY_STEPS);
const ARRANGE_KEYS = [...ARROWS, ...ARROWS.map((key) => `Shift+${key}`)].join(" ");

function onArrangeKey(id: WidgetId, event: KeyboardEvent) {
  const step = KEY_STEPS[event.key];
  if (!step || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (event.shiftKey) resizeWidgetBy(id, step[0], step[1]);
  else moveWidgetBy(id, step[0], step[1]);
}

/** The resize handles: 12 px edges and 20 px corners, each with a visible mark. */
const HANDLES: { handle: Exclude<Handle, "move">; className: string; mark: string }[] = [
  { handle: "n", className: "inset-x-5 top-0 h-3 cursor-ns-resize", mark: "h-1 w-8" },
  { handle: "s", className: "inset-x-5 bottom-0 h-3 cursor-ns-resize", mark: "h-1 w-8" },
  { handle: "w", className: "inset-y-5 left-0 w-3 cursor-ew-resize", mark: "h-8 max-h-full w-1" },
  { handle: "e", className: "inset-y-5 right-0 w-3 cursor-ew-resize", mark: "h-8 max-h-full w-1" },
  { handle: "nw", className: "top-0 left-0 size-5 cursor-nwse-resize", mark: "size-2.5" },
  { handle: "ne", className: "top-0 right-0 size-5 cursor-nesw-resize", mark: "size-2.5" },
  { handle: "sw", className: "bottom-0 left-0 size-5 cursor-nesw-resize", mark: "size-2.5" },
  { handle: "se", className: "right-0 bottom-0 size-5 cursor-nwse-resize", mark: "size-2.5" },
];

/**
 * The Arrange mode cover of one widget (owner answers Q13, Q14): a drag anywhere on it moves the
 * widget; the edges and corners resize it. It takes keyboard focus: arrow keys move, Shift+arrow
 * keys resize (R38.10). The widget body under it takes no input meanwhile.
 */
function ArrangeCover({
  id,
  title,
  onStart,
}: {
  id: WidgetId;
  title: string;
  onStart: (id: WidgetId, handle: Handle, event: PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Move or resize ${title}`}
      aria-roledescription="arrange handle"
      aria-keyshortcuts={ARRANGE_KEYS}
      data-arrange={id}
      onPointerDown={(event) => onStart(id, "move", event)}
      onKeyDown={(event) => onArrangeKey(id, event)}
      className="absolute inset-0 z-10 flex cursor-grab touch-none items-center justify-center overflow-hidden bg-bg-canvas/80 text-sm text-text-primary ring-2 ring-border-strong select-none ring-inset focus-visible:-outline-offset-4 active:cursor-grabbing"
    >
      <span className="flex max-w-[calc(100%-3rem)] min-w-0 items-center gap-1.5 rounded-md bg-bg-elevated px-2 py-0.5">
        <Icon name="grip" className="size-4 shrink-0 text-text-secondary" />
        <span className="truncate">{title}</span>
      </span>
      {HANDLES.map(({ handle, className, mark }) => (
        <div
          key={handle}
          aria-hidden="true"
          data-resize={handle}
          onPointerDown={(event) => onStart(id, handle, event)}
          className={cn("absolute grid place-items-center", className)}
        >
          <span className={cn("rounded-full bg-text-secondary", mark)} />
        </div>
      ))}
    </div>
  );
}

/**
 * One widget in the grid: a title row (not for one-row widgets) and its body region for F6
 * (P2.12). In Arrange mode a cover takes every pointer and key for moving and resizing.
 */
const GridItem = memo(function GridItem({
  id,
  rect,
  arranging,
  dragging,
  onStart,
}: {
  id: WidgetId;
  rect: Rect;
  arranging: boolean;
  dragging: boolean;
  onStart: (id: WidgetId, handle: Handle, event: PointerEvent<HTMLElement>) => void;
}) {
  const { title, sideHeader, component: Body } = WIDGETS[id];
  const mini = useUiStore((state) => state.mini);
  return (
    <div
      data-grid-item={id}
      style={area(rect)}
      onPointerDownCapture={() => activateWidget(id)}
      onFocusCapture={() => activateWidget(id)}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-bg-surface text-text-primary",
        dragging && "opacity-60",
      )}
    >
      {!sideHeader && (
        <div data-widget-header={id} className="flex h-6 shrink-0 items-center border-b px-2 select-none">
          <span data-slot="widget-title" className="truncate text-[13px] text-text-secondary">
            {title}
          </span>
        </div>
      )}
      {/* In the mini player the band region is the mini player's own (UD19). */}
      <section
        aria-label={title}
        data-widget={id === "transport" && mini ? undefined : id}
        tabIndex={-1}
        inert={arranging}
        className="min-h-0 min-w-0 flex-1 overflow-hidden focus-visible:-outline-offset-2"
      >
        {/* The mini player shows its own band (UD19); the grid copy waits off screen. */}
        {id === "transport" && mini ? null : <Body />}
      </section>
      {arranging && <ArrangeCover id={id} title={title} onStart={onStart} />}
    </div>
  );
});

/**
 * The snap grid (R38.1): 12 columns by 12 rows that fill the area between the header and the
 * status line, so widgets scale with the window. The layout changes only in Arrange mode (owner
 * answer Q13): a drag anywhere on a widget moves it, a drag on an edge or corner resizes it. Both
 * snap to cells, show the target cells and push by the engine rules; a refused drop shows red and
 * changes nothing (R38.4, R38.5).
 */
export function GridShell() {
  const layout = useGridStore((state) => state.layout);
  const arranging = useUiStore((state) => state.arranging);
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    void startArrangement();
  }, []);

  // Stable for the memoized items: a drag step renders the preview, not every widget body.
  const onStart = useCallback((id: WidgetId, handle: Handle, event: PointerEvent<HTMLElement>) => {
    const grid = gridRef.current;
    const start = useGridStore.getState().layout[id];
    // Only the primary button drags, and only in Arrange mode.
    if (!useUiStore.getState().arranging || !grid || !start || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const box = grid.getBoundingClientRect();
    const cellW = box.width / GRID;
    const cellH = box.height / GRID;
    const { min } = WIDGETS[id];
    let current: Drag | null = null;
    const onMove = (move: globalThis.PointerEvent) => {
      const dx = Math.round((move.clientX - event.clientX) / cellW);
      const dy = Math.round((move.clientY - event.clientY) / cellH);
      const rect = draggedRect(start, handle, dx, dy, min);
      if (
        current &&
        current.rect.x === rect.x &&
        current.rect.y === rect.y &&
        current.rect.w === rect.w &&
        current.rect.h === rect.h
      )
        return;
      current = { id, rect, allowed: previewRect(id, rect) !== null };
      setDrag(current);
    };
    const finish = (drop: boolean) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      if (drop && current?.allowed) commitRect(id, current.rect);
      setDrag(null);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    // Esc cancels the drag; the widget stays where it was, and Arrange mode stays on.
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      ref={gridRef}
      data-grid=""
      data-arranging={arranging ? "" : undefined}
      className="relative grid size-full min-h-0 grid-cols-12 grid-rows-12 gap-px bg-border"
    >
      {Object.entries(layout).map(([id, rect]) =>
        isWidgetId(id) ? (
          <GridItem key={id} id={id} rect={rect} arranging={arranging} dragging={drag?.id === id} onStart={onStart} />
        ) : null,
      )}
      {drag && (
        <div
          aria-hidden="true"
          data-grid-preview={drag.allowed ? "allowed" : "refused"}
          style={area(drag.rect)}
          className={cn(
            "pointer-events-none z-20 rounded-sm border-2",
            // Red only for a refused drop (R38.4).
            drag.allowed
              ? "border-dashed border-text-secondary bg-text-secondary/10"
              : "border-brand-red bg-brand-red/20",
          )}
        />
      )}
    </div>
  );
}
