// E2E page entry (P2.15). The mocks install before the app starts.
import { retagSong, setLyrics } from "./install-mocks";
import { emit } from "@tauri-apps/api/event";
import "../../src/main";
import { addWidget, getDock, replaceArrangement, setWidgetVisible } from "../../src/shell/layouts";
import { WIDGET_IDS, type WidgetId } from "../../src/shell/widgets";

function dock() {
  const api = getDock();
  if (!api) throw new Error("e2e: no dock");
  return api;
}

/** Test hooks. They act on the real dock of the running app. */
const hooks = {
  /** Shows a hideable widget where the default preset puts it (Now playing is hidden by default). */
  show(id: WidgetId): void {
    setWidgetVisible(id, true, dock());
  },
  /** Hides a hideable widget. */
  hide(id: WidgetId): void {
    setWidgetVisible(id, false, dock());
  },
  /** Clears the dock and stacks all five dock widgets in one column (P2-AC6 clamp case). */
  stackAll(): void {
    replaceArrangement(dock(), (api) =>
      WIDGET_IDS.forEach((id, index) =>
        addWidget(api, id, index === 0 ? undefined : { referencePanel: WIDGET_IDS[index - 1], direction: "below" }),
      ),
    );
  },
  /** The minimum size the dock applies to the group of each widget (D33, D45 clamp). */
  groupMinimums(): Record<string, { width: number; height: number }> {
    const result: Record<string, { width: number; height: number }> = {};
    for (const group of dock().groups) {
      for (const panel of group.panels) {
        result[panel.id] = { width: group.minimumWidth, height: group.minimumHeight };
      }
    }
    return result;
  },
  /** Sends the window close request, like the close button (P9-AC11). */
  closeRequest(): Promise<void> {
    return emit("tauri://close-requested");
  },
  setLyrics,
  retagSong,
  /** Adds a widget as a tab in the group of another widget. */
  addAsTab(id: WidgetId, reference: WidgetId): void {
    addWidget(dock(), id, { referencePanel: reference, direction: "within" });
  },
};

declare global {
  interface Window {
    e2e: typeof hooks;
    /** Messages the app sent to the log plugin (install-mocks.ts). */
    e2eLog?: string[];
    /** Delays the mocked `favorites` reply (row-drag.spec.ts). */
    e2eSlowFavorites?: boolean;
    /** Delays the mocked `playlist_entries` reply (playlists.spec.ts). */
    e2eSlowEntries?: boolean;
    /** Makes the mocked `playlist_entries` fail (playlists.spec.ts). */
    e2eFailEntries?: boolean;
    /** Holds the return of the mocked `playlist_remove_entry` until `e2eReleaseRemove` (playlists.spec.ts). */
    e2eSlowRemove?: boolean;
    /** Releases the held `playlist_remove_entry` reply. */
    e2eReleaseRemove?: () => void;
    /** The mocked `window_set_mini` calls (UD19). */
    e2eMini?: { on: boolean; height: number }[];
  }
}
window.e2e = hooks;
