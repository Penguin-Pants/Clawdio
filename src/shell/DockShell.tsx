import { type FunctionComponent, type ReactNode, useCallback, useEffect, useRef } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewGroupDropLocation,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelProps,
  type PanelTransfer,
  type Position,
} from "dockview-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUiStore } from "@/store/ui";
import {
  type BarWidgetId,
  type DropPosition,
  type DropTarget,
  allowDrop,
  isBarWidget,
  onBarHeightChange,
  setBarContentHeight,
  sharesRow,
} from "./bar-rules";
import { type Orientation, applyClamp, toNode } from "./clamp";
import { waitForPopulated } from "./measure";
import { commands } from "@/lib/ipc/commands";
import { applyMeasureLayout, attachDock, defaultArrangement, guardLibrary, visibleWidgets } from "./layouts";
import { UNKNOWN_COMPONENT, restoreLayout, watchLayout } from "./persistence";
import { LibraryTab, WidgetTab } from "./WidgetTab";
import { WIDGET_IDS, WIDGETS, type WidgetId } from "./widgets";

/** Dock theme: every chrome color comes from token variables (P2.10, src/styles/dockview-theme.css). */
const THEME: DockviewTheme = {
  name: "app",
  className: "dockview-theme-app",
  colorScheme: "dark",
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "group",
};

/**
 * A bar widget's content at its natural height (D57): a block with auto height, so the widget's
 * own `h-full` falls back to its content. Each size change (text scaling too) sets the bar height.
 */
function BarContent({ id, children }: { id: BarWidgetId; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBarContentHeight(id, element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [id]);
  return (
    <div ref={ref} data-bar-content={id}>
      {children}
    </div>
  );
}

/** The widget body: a focus target for F6 (P2.12) named by the widget title. */
function widgetComponent(id: WidgetId) {
  const { component: Body, title } = WIDGETS[id];
  function Widget() {
    return (
      <section
        aria-label={title}
        data-widget={id}
        tabIndex={-1}
        className="size-full overflow-hidden bg-bg-surface text-text-primary focus-visible:-outline-offset-2"
      >
        {isBarWidget(id) ? (
          <BarContent id={id}>
            <Body />
          </BarContent>
        ) : (
          <Body />
        )}
      </section>
    );
  }
  Widget.displayName = `${id}Widget`;
  return Widget;
}

const COMPONENTS: Record<string, FunctionComponent<IDockviewPanelProps>> = {
  ...Object.fromEntries(WIDGET_IDS.map((id) => [id, widgetComponent(id)])),
  // A saved panel of a widget this version does not know; removed right after the load (P9.4).
  [UNKNOWN_COMPONENT]: () => null,
};

/**
 * The arrangement at start: the measurement layout in measurement mode (not saved, P3.1),
 * else the saved layout (P9.4). Then layout changes save, and a close request writes a
 * pending save first (P9.3).
 */
async function startArrangement(api: DockviewApi, container: HTMLElement | null): Promise<void> {
  const mode = await commands.measureMode().catch(() => null);
  if (mode) {
    applyMeasureLayout(mode, api);
    // The measurement scripts wait for this signal before the idle period (P3.5, D28).
    waitForPopulated(async () => !(await commands.scanRunning())).then(() => commands.measureReady(), console.error);
    return;
  }
  const text = await commands.layoutLoad().catch(() => null);
  restoreLayout(api, text, {
    width: container?.clientWidth ?? api.width,
    height: container?.clientHeight ?? api.height,
  });
  const watcher = watchLayout(api);
  try {
    await getCurrentWindow().onCloseRequested(() => watcher.flush());
  } catch {
    // No app window (tests outside the shell): nothing to flush on close.
  }
}
const TAB_COMPONENTS = { widget: WidgetTab, library: LibraryTab };

/**
 * Scrolls each group's active tab into view, so a narrow tabbed group never cuts it off
 * (P17-AC4). The other tabs stay in the scrolling strip and its overflow list.
 */
function showActiveTabs(root: HTMLElement | null) {
  requestAnimationFrame(() => {
    root?.querySelectorAll<HTMLElement>(".dv-tab.dv-active-tab").forEach((tab) => {
      const strip = tab.closest<HTMLElement>(".dv-tabs-container");
      if (!strip) return;
      // The overflow button appears after the tabs and narrows the strip: look again then.
      if (!watchedStrips.has(strip)) {
        watchedStrips.add(strip);
        stripObserver.observe(strip);
      }
      const tabBox = tab.getBoundingClientRect();
      const stripBox = strip.getBoundingClientRect();
      const before = strip.scrollLeft;
      if (tabBox.right > stripBox.right) strip.scrollLeft += tabBox.right - stripBox.right;
      else if (tabBox.left < stripBox.left) strip.scrollLeft -= stripBox.left - tabBox.left;
      // Dockview's scrollbar keeps its own offset from scroll events and writes it back on its
      // next frame; the browser sends the event only one frame later, so tell it now.
      if (strip.scrollLeft !== before) strip.dispatchEvent(new Event("scroll"));
    });
  });
}

const watchedStrips = new WeakSet<HTMLElement>();
const stripObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    // A strip of a rebuilt dock leaves the page: stop watching it.
    if (!entry.target.isConnected) {
      stripObserver.unobserve(entry.target);
      continue;
    }
    showActiveTabs(entry.target.closest<HTMLElement>(".dv-groupview"));
  }
});

/** A drop event as the bar rule needs it (both `onWillShowOverlay` and `onWillDrop`). */
interface DropEvent {
  kind: DockviewGroupDropLocation;
  position: Position;
  group?: { id: string; panels: { id: string }[] };
  getData(): PanelTransfer | undefined;
}

/**
 * Applies the bar drop rule (D58, P23.2) to a Dockview drop. A tab bar drop is a center drop;
 * an `edge` drop docks to the window. A drag from outside the dock is not a widget and passes.
 */
function dropAllowed(api: DockviewApi, event: DropEvent): boolean {
  const data = event.getData();
  if (!data) return true;
  const source = data.panelId ?? api.getGroup(data.groupId)?.panels[0]?.id;
  if (!source) return true;
  const position: DropPosition = event.kind === "tab" || event.kind === "header_space" ? "center" : event.position;
  let target: DropTarget = "window";
  if (event.kind !== "edge" && event.group) {
    const { grid } = api.toJSON();
    const paired = sharesRow(toNode(grid.root), grid.orientation as Orientation, event.group.id);
    target = { widgets: event.group.panels.map((panel) => panel.id), paired };
  }
  return allowDrop(source, target, position);
}

/**
 * The docking shell (P2.1, D8): drag docking, splitters and tabbed groups. Floating groups are
 * off, no pop-out call exists and no tab context menu is configured.
 */
export function DockShell() {
  const apiRef = useRef<DockviewApi | null>(null);
  const setVisibleWidgets = useUiStore((state) => state.setVisibleWidgets);

  const onReady = useCallback(
    ({ api }: DockviewReadyEvent) => {
      apiRef.current = api;
      attachDock(api);
      guardLibrary(api);
      const sync = () => {
        setVisibleWidgets(visibleWidgets(api));
        applyClamp(api);
        showActiveTabs(containerRef.current);
      };
      api.onDidActivePanelChange(() => showActiveTabs(containerRef.current));
      api.onDidAddPanel(sync);
      api.onDidRemovePanel(sync);
      api.onDidMovePanel(sync);
      api.onDidAddGroup(sync);
      api.onDidRemoveGroup(sync);
      api.onDidLayoutFromJSON(sync);
      // A refused drop shows no overlay and moves nothing (D58).
      api.onWillShowOverlay((event) => {
        if (!dropAllowed(api, event)) event.preventDefault();
      });
      api.onWillDrop((event) => {
        if (!dropAllowed(api, event)) event.preventDefault();
      });
      defaultArrangement(api);
      sync();
      void startArrangement(api, containerRef.current);
    },
    [setVisibleWidgets],
  );

  // The D45 clamp runs on every dock resize.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (apiRef.current) applyClamp(apiRef.current);
      showActiveTabs(element);
    });
    observer.observe(element);
    // A new bar height (D57) changes the bar group limits.
    const stopBars = onBarHeightChange(() => {
      if (apiRef.current) applyClamp(apiRef.current);
    });
    return () => {
      observer.disconnect();
      stopBars();
      attachDock(null);
    };
  }, []);

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden">
      <DockviewReact
        className="size-full"
        theme={THEME}
        components={COMPONENTS}
        tabComponents={TAB_COMPONENTS}
        defaultTabComponent={WidgetTab}
        disableFloatingGroups
        dndStrategy="pointer"
        singleTabMode="default"
        onReady={onReady}
      />
    </div>
  );
}
