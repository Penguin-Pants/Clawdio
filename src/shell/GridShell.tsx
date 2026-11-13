import { type KeyboardEvent, type PointerEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "@/components/icons";
import { commands } from "@/lib/ipc/commands";
import { cn } from "@/lib/utils";
import { markArranged } from "@/store/selection-restore";
import { useUiStore } from "@/store/ui";
import { restoreColumns, watchColumns } from "./columns-persistence";
import { GRID, type Rect, clampRect } from "./grid/engine";
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

type Handle = "move" | "e" | "s" | "se";

/** Alt+arrow keys move by one cell; Alt+Shift+arrow keys resize by one cell (R38.10). */
const KEY_STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function onHeaderKey(id: WidgetId, event: KeyboardEvent) {
  const step = KEY_STEPS[event.key];
  if (!step || !event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (event.shiftKey) resizeWidgetBy(id, step[0], step[1]);
  else moveWidgetBy(id, step[0], step[1]);
}

/**
 * One widget in the grid: its header (a title row, or a grip strip at the left of a one-row
 * widget), its body region for F6 (P2.12) and, while unlocked, the resize handles (R38.5).
 */
const GridItem = memo(function GridItem({
  id,
  rect,
  locked,
  dragging,
  onStart,
}: {
  id: WidgetId;
  rect: Rect;
  locked: boolean;
  dragging: boolean;
  onStart: (id: WidgetId, handle: Handle, event: PointerEvent<HTMLElement>) => void;
}) {
  const { title, sideHeader, component: Body } = WIDGETS[id];
  const mini = useUiStore((state) => state.mini);
  const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  const keys = locked
    ? undefined
    : [...arrows.map((key) => `Alt+${key}`), ...arrows.map((key) => `Alt+Shift+${key}`)].join(" ");
  const header = (
    <div
      role="group"
      tabIndex={0}
      aria-label={`${title} header`}
      aria-roledescription="widget header"
      aria-keyshortcuts={keys}
      data-widget-header={id}
      onPointerDown={(event) => onStart(id, "move", event)}
      onKeyDown={(event) => onHeaderKey(id, event)}
      className={cn(
        "flex shrink-0 touch-none items-center gap-1 text-text-muted select-none focus-visible:-outline-offset-2",
        !locked && "cursor-grab",
        sideHeader ? "w-4 justify-center border-r" : "h-6 border-b px-2",
      )}
    >
      {!locked && <Icon name="grip" className="size-3.5" />}
      {!sideHeader && (
        <span data-slot="widget-title" className="truncate text-[13px] text-text-secondary">
          {title}
        </span>
      )}
    </div>
  );
  return (
    <div
      data-grid-item={id}
      style={area(rect)}
      onPointerDownCapture={() => activateWidget(id)}
      onFocusCapture={() => activateWidget(id)}
      className={cn(
        "relative flex min-h-0 min-w-0 overflow-hidden bg-bg-surface text-text-primary",
        sideHeader ? "flex-row" : "flex-col",
        dragging && "opacity-60",
      )}
    >
      {header}
      {/* In the mini player the band region is the mini player's own (UD19). */}
      <section
        aria-label={title}
        data-widget={id === "transport" && mini ? undefined : id}
        tabIndex={-1}
        className="min-h-0 min-w-0 flex-1 overflow-hidden focus-visible:-outline-offset-2"
      >
        {/* The mini player shows its own band (UD19); the grid copy waits off screen. */}
        {id === "transport" && mini ? null : <Body />}
      </section>
      {!locked && (
        <>
          {/*
           * Pointer-only handles (R38.5; the keyboard path is R38.10). A widget with lists keeps
           * its scrollbars free: its right edge handle is the header row and the corner handle
           * is small. A one-row widget has no scrollbar, so its whole right edge resizes.
           */}
          <div
            aria-hidden="true"
            data-resize="e"
            onPointerDown={(event) => onStart(id, "e", event)}
            className={cn("absolute top-0 right-0 w-1.5 cursor-ew-resize touch-none", sideHeader ? "bottom-0" : "h-6")}
          />
          {sideHeader && (
            <div
              aria-hidden="true"
              data-resize="s"
              onPointerDown={(event) => onStart(id, "s", event)}
              className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none"
            />
          )}
          <div
            aria-hidden="true"
            data-resize="se"
            onPointerDown={(event) => onStart(id, "se", event)}
            className="absolute right-0 bottom-0 size-2.5 cursor-nwse-resize touch-none"
          />
        </>
      )}
    </div>
  );
});

/**
 * The snap grid (R38.1): 12 columns by 12 rows that fill the area between the header and the
 * status line, so widgets scale with the window. A drag by the header moves a widget; a drag on
 * the right edge, the bottom edge or the corner resizes it. Both snap to cells, show the target
 * cells and push by the engine rules; a refused drop shows red and changes nothing (R38.4,
 * R38.5). Lock layout stops both (R38.9).
 */
export function GridShell() {
  const layout = useGridStore((state) => state.layout);
  const locked = useUiStore((state) => state.locked);
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    void startArrangement();
  }, []);

  // Stable for the memoized items: a drag step renders the preview, not every widget body.
  const onStart = useCallback(
    (id: WidgetId, handle: Handle, event: PointerEvent<HTMLElement>) => {
      const grid = gridRef.current;
      const start = useGridStore.getState().layout[id];
      // Controls inside a header keep their clicks; only the primary button drags.
      if (locked || !grid || !start || event.button !== 0) return;
      if (handle === "move" && (event.target as Element).closest("button, input, [role='button']")) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const box = grid.getBoundingClientRect();
      const cellW = box.width / GRID;
      const cellH = box.height / GRID;
      const { min } = WIDGETS[id];
      let current: Drag | null = null;
      const rectAt = (clientX: number, clientY: number): Rect => {
        const dx = Math.round((clientX - event.clientX) / cellW);
        const dy = Math.round((clientY - event.clientY) / cellH);
        if (handle === "move") return clampRect({ ...start, x: start.x + dx, y: start.y + dy }, min);
        const w = handle === "s" ? start.w : Math.min(GRID - start.x, Math.max(min.w, start.w + dx));
        const h = handle === "e" ? start.h : Math.min(GRID - start.y, Math.max(min.h, start.h + dy));
        return { ...start, w, h };
      };
      const onMove = (move: globalThis.PointerEvent) => {
        const rect = rectAt(move.clientX, move.clientY);
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
      // Esc cancels the drag; the widget stays where it was.
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
    },
    [locked],
  );

  return (
    <div
      ref={gridRef}
      data-grid=""
      data-locked={locked ? "" : undefined}
      className="relative grid size-full min-h-0 grid-cols-12 grid-rows-12 gap-px bg-border"
    >
      {Object.entries(layout).map(([id, rect]) =>
        isWidgetId(id) ? (
          <GridItem key={id} id={id} rect={rect} locked={locked} dragging={drag?.id === id} onStart={onStart} />
        ) : null,
      )}
      {drag && (
        <div
          aria-hidden="true"
          data-grid-preview={drag.allowed ? "allowed" : "refused"}
          style={area(drag.rect)}
          className={cn(
            "pointer-events-none z-10 rounded-sm border-2",
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
