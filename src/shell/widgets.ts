import type { FunctionComponent } from "react";
import { LibraryWidget } from "@/widgets/library/LibraryWidget";
import { LyricsWidget } from "@/widgets/lyrics/LyricsWidget";
import { NowPlayingWidget } from "@/widgets/now-playing/NowPlayingWidget";
import { PlaylistsWidget } from "@/widgets/playlists/PlaylistsWidget";
import { QueueWidget } from "@/widgets/queue/QueueWidget";
import { TransportWidget } from "@/widgets/transport/TransportWidget";

/** The fixed widget list (R5). No other widget exists (section 6 complexity budget). */
export const WIDGET_IDS = ["library", "transport", "nowPlaying", "playlists", "queue", "lyrics"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  /** False only for Library, which cannot be hidden or closed (R28). */
  hideable: boolean;
  /** Minimum size in px, header included (D33). */
  minWidth: number;
  minHeight: number;
  component: FunctionComponent;
}

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  library: {
    id: "library",
    title: "Library",
    hideable: false,
    minWidth: 320,
    minHeight: 240,
    component: LibraryWidget,
  },
  transport: {
    id: "transport",
    title: "Transport controls",
    hideable: true,
    minWidth: 320,
    minHeight: 88,
    component: TransportWidget,
  },
  nowPlaying: {
    id: "nowPlaying",
    title: "Now playing",
    hideable: true,
    minWidth: 240,
    minHeight: 88,
    component: NowPlayingWidget,
  },
  playlists: {
    id: "playlists",
    title: "Playlists",
    hideable: true,
    minWidth: 200,
    minHeight: 160,
    component: PlaylistsWidget,
  },
  queue: {
    id: "queue",
    title: "Play queue",
    hideable: true,
    minWidth: 200,
    minHeight: 160,
    component: QueueWidget,
  },
  lyrics: {
    id: "lyrics",
    title: "Lyrics",
    hideable: true,
    minWidth: 200,
    minHeight: 160,
    component: LyricsWidget,
  },
};

export function isWidgetId(value: string): value is WidgetId {
  return (WIDGET_IDS as readonly string[]).includes(value);
}
