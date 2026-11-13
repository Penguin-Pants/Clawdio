// E2E page entry (P2.15). The mocks install before the app starts.
import { retagSong, setLyrics } from "./install-mocks";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import "../../src/main";
import { setWidgetVisible, useGridStore } from "../../src/shell/layouts";
import type { Layout } from "../../src/shell/grid/engine";
import type { WidgetId } from "../../src/shell/widgets";

/** Test hooks. They act on the grid of the running app. */
const hooks = {
  /** Shows a hidden widget where it fits (R38.7). */
  show(id: WidgetId): void {
    setWidgetVisible(id, true);
  },
  /** Hides a hideable widget. */
  hide(id: WidgetId): void {
    setWidgetVisible(id, false);
  },
  /** The widget cells now (R38.2). */
  layout(): Layout {
    return useGridStore.getState().layout;
  },
  /** Sets the widget cells, as a saved file would (tests only). */
  setLayout(layout: Layout): void {
    useGridStore.setState({ layout });
  },
  /** Sends the window close request, like the close button (P9-AC11). */
  closeRequest(): Promise<void> {
    return emit("tauri://close-requested");
  },
  setLyrics,
  retagSong,
  /** Sends `library-changed`, like the end of a scan. */
  libraryChanged(): Promise<void> {
    return emit("library-changed");
  },
  /** Sends `library-selection-restored`, like Rust after the resolve or a new folder (R37). */
  selectionRestored(answer: unknown): Promise<void> {
    return emit("library-selection-restored", answer);
  },
  /** Sends a command to the mocked IPC with no click, so the focus stays where it is (R35.4). */
  invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return invoke(command, args);
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
    /** Holds the mocked `columns_load` reply until `e2eReleaseColumns` (selection-restore.spec.ts). */
    e2eHoldColumns?: boolean;
    /** Releases the held `columns_load` reply. */
    e2eReleaseColumns?: () => void;
    /** Cuts the mocked `library_artists` reply to this many artists (selection-restore.spec.ts). */
    e2eArtistLimit?: number;
    /** Holds the mocked `library_artists` reply until `e2eReleaseArtists`. */
    e2eHoldArtists?: boolean;
    /** Releases the held `library_artists` reply. */
    e2eReleaseArtists?: () => void;
    /** Holds the mocked `library_selection_restored` reply until `e2eReleaseRestore` (selection-restore.spec.ts). */
    e2eHoldRestore?: boolean;
    /** Releases the held `library_selection_restored` reply. */
    e2eReleaseRestore?: () => void;
    /** The mocked `window_set_mini` calls (UD19). */
    e2eMini?: { on: boolean; height: number }[];
  }
}
window.e2e = hooks;
