import { type FunctionComponent, useCallback, useEffect, useRef } from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelProps,
} from "dockview-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useUiStore } from "@/store/ui";
import { applyClamp } from "./clamp";
import { waitForPopulated } from "./measure";
import { commands } from "@/lib/ipc/commands";
import { observeSize } from "@/lib/resize";
import { applyMeasureLayout, attachDock, defaultArrangement, guardLibrary, visibleWidgets } from "./layouts";
import { applySideWidths } from "./presets";
import { keepSideWidths } from "./side-widths";
import { installSplitters, scheduleSashRefresh } from "./splitters";
import { restoreColumns, watchColumns } from "./columns-persistence";
import { UNKNOWN_COMPONENT, restoreLayout, watchLayout } from "./persistence";
import { GroupActions, LibraryTab, WidgetTab } from "./WidgetTab";
import { WIDGET_IDS, WIDGETS, type WidgetId } from "./widgets";

/** Dock theme: every chrome color comes from token variables (P2.10, src/styles/dockview-theme.css). */
const THEME: DockviewTheme = {
  name: "app",
  className: "dockview-theme-app",
  colorScheme: "dark",
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "group",
};

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
        <Body />
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
  const size = { width: container?.clientWidth ?? api.width, height: container?.clientHeight ?? api.height };
  if (!restoreLayout(api, text, size)) {
    // The default preset ran before the dock had a size: set its pixel widths now (UD6).
    api.layout(size.width, size.height, true);
    applySideWidths(api);
  }
  const watcher = watchLayout(api);
  // The Songs column state is a file of its own (PS-6, UD13).
  await restoreColumns();
  const columns = watchColumns();
  try {
    await getCurrentWindow().onCloseRequested(async () => {
      await Promise.all([watcher.flush(), columns.flush()]);
    });
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

/** Lock layout (DK-5, UD15): no widget drag and no group resize. */
function applyLock(api: DockviewApi, locked: boolean): void {
  api.updateOptions({ locked, disableDnd: locked });
}

/**
 * The docking shell (P2.1, D8): drag docking, splitters, tabbed groups and floating groups
 * inside the window (DK-3). No pop-out call exists and no tab context menu is configured
 * (DK-10). The proportional layout is off, so sidebars keep their pixel widths (SP-4).
 */
export function DockShell() {
  const apiRef = useRef<DockviewApi | null>(null);
  const sideRef = useRef<ReturnType<typeof keepSideWidths> | null>(null);
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
      // The separators get their keyboard semantics after each layout change (UD7).
      api.onDidLayoutChange(scheduleSashRefresh);
      api.onDidAddPanel(sync);
      api.onDidRemovePanel(sync);
      api.onDidMovePanel(sync);
      api.onDidAddGroup(sync);
      api.onDidRemoveGroup(sync);
      api.onDidLayoutFromJSON(sync);
      defaultArrangement(api);
      sync();
      applyLock(api, useUiStore.getState().locked);
      sideRef.current = keepSideWidths(api);
      void startArrangement(api, containerRef.current);
    },
    [setVisibleWidgets],
  );

  // The D45 clamp runs once per frame of dock resizes (PF-2, UD24).
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = containerRef.current;
    const stop = element
      ? observeSize(element, () => {
          if (apiRef.current) applyClamp(apiRef.current);
          sideRef.current?.onDockResize();
          showActiveTabs(element);
          scheduleSashRefresh();
        })
      : () => {};
    const stopSplitters = installSplitters();
    const stopLock = useUiStore.subscribe((state, previous) => {
      if (apiRef.current && state.locked !== previous.locked) applyLock(apiRef.current, state.locked);
    });
    return () => {
      stop();
      stopSplitters();
      stopLock();
      sideRef.current?.dispose();
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
        rightHeaderActionsComponent={GroupActions}
        dndStrategy="pointer"
        proportionalLayout={false}
        floatingGroupBounds="boundedWithinViewport"
        singleTabMode="default"
        onReady={onReady}
      />
    </div>
  );
}
