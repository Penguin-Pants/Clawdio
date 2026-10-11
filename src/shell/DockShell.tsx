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
      };
      api.onDidAddPanel(sync);
      api.onDidRemovePanel(sync);
      api.onDidMovePanel(sync);
      api.onDidAddGroup(sync);
      api.onDidRemoveGroup(sync);
      api.onDidLayoutFromJSON(sync);
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
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
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
