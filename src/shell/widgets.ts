import type { FunctionComponent } from "react";
import { AlbumWidget, ArtistWidget, SearchWidget, SongsWidget, TreeWidget } from "@/widgets/library/LibraryWidgets";
import { LyricsWidget } from "@/widgets/lyrics/LyricsWidget";
import { NowPlayingWidget } from "@/widgets/now-playing/NowPlayingWidget";
import { PlaylistsWidget } from "@/widgets/playlists/PlaylistsWidget";
import { QueueWidget } from "@/widgets/queue/QueueWidget";
import { TransportBand } from "./TransportBand";
import type { MinSize } from "./grid/engine";

/** The grid widgets (R38.2), in the order of the View menu. No other widget exists. */
export const WIDGET_IDS = [
  "transport",
  "search",
  "artist",
  "album",
  "songs",
  "tree",
  "playlists",
  "queue",
  "lyrics",
  "nowPlaying",
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  /** False for Songs and Transport controls (R38.7). */
  hideable: boolean;
  /** Minimum size in cells (R38.6). */
  min: MinSize;
  /**
   * A one-row widget has its header as a grip strip at the left, so its content keeps the row
   * height; other widgets have a title row at the top (R38.4).
   */
  sideHeader: boolean;
  component: FunctionComponent;
}

const widget = (
  id: WidgetId,
  title: string,
  component: FunctionComponent,
  min: MinSize = { w: 2, h: 2 },
  hideable = true,
): WidgetDefinition => ({ id, title, component, min, hideable, sideHeader: min.h === 1 });

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  transport: widget("transport", "Transport controls", TransportBand, { w: 4, h: 1 }, false),
  search: widget("search", "Search", SearchWidget, { w: 2, h: 1 }),
  artist: widget("artist", "Artist", ArtistWidget),
  album: widget("album", "Album", AlbumWidget),
  songs: widget("songs", "Songs", SongsWidget, { w: 3, h: 2 }, false),
  tree: widget("tree", "Tree", TreeWidget),
  playlists: widget("playlists", "Playlists", PlaylistsWidget),
  queue: widget("queue", "Play queue", QueueWidget),
  lyrics: widget("lyrics", "Lyrics", LyricsWidget),
  nowPlaying: widget("nowPlaying", "Now playing", NowPlayingWidget, { w: 2, h: 3 }),
};

export function isWidgetId(value: string): value is WidgetId {
  return (WIDGET_IDS as readonly string[]).includes(value);
}

/** The minimum size of a widget id; an unknown id gets the common 2 x 2. */
export function minOf(id: string): MinSize {
  return isWidgetId(id) ? WIDGETS[id].min : { w: 2, h: 2 };
}
