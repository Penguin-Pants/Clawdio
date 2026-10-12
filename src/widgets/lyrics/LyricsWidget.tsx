import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type Lyrics } from "@/lib/ipc/commands";
import { on } from "@/lib/ipc/events";
import { useCommand } from "@/lib/ipc/hooks";
import { currentTrack, usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { EmptyHint } from "../hint";

/** The lyrics read for a track (null: no source), or null when nothing plays. */
type Loaded = { track: number; lyrics: Lyrics | null } | null;

function errorMessage(error: unknown, fallback: string): string {
  return typeof error === "object" && error !== null && "message" in error ? String(error.message) : fallback;
}

/**
 * Lyrics widget (R9, P13.4): the playing song's lyrics from its `.lrc` or `.txt` file or its
 * tags, read again on `lyrics-changed`. "Fetch lyrics" shows only when no source exists and
 * works while Online lookups are on (P15.3); the saved lyrics arrive by `lyrics-changed`.
 */
export function LyricsWidget() {
  const track = usePlayerStore((state) => currentTrack(state.queue));
  const online = useSettingsStore((state) => state.view.onlineLookups);
  // The song a fetch runs for: another song's button stays usable meanwhile.
  const [fetching, setFetching] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const unlisten = on("lyrics-changed", () => setVersion((value) => value + 1));
    return () => void unlisten.then((stop) => stop());
  }, []);
  const loaded = useCommand<Loaded>(
    () => (track === null ? Promise.resolve(null) : commands.lyricsGet(track).then((lyrics) => ({ track, lyrics }))),
    null,
    [track, version],
  );
  // While the new song's lyrics load, neither the earlier song's text nor the hint shows.
  if (track !== null && loaded?.track !== track) return null;
  const current = track === null ? null : loaded;
  if (current === null || current.lyrics === null || current.lyrics.text.trim() === "") {
    return (
      <div className="flex flex-col items-start">
        <EmptyHint>No lyrics for this song.</EmptyHint>
        {current?.lyrics === null && track !== null && (
          <Button
            variant="outline"
            size="sm"
            className="mx-3"
            disabled={!online || fetching === track}
            onClick={() => {
              setFetching(track);
              commands
                .lyricsFetch(track)
                .catch((error: unknown) =>
                  useUiStore.getState().showMessage(errorMessage(error, "Cannot fetch lyrics")),
                )
                .finally(() => setFetching((value) => (value === track ? null : value)));
            }}
          >
            Fetch lyrics
          </Button>
        )}
      </div>
    );
  }
  return (
    <section
      aria-label="Lyrics text"
      tabIndex={0}
      className="size-full overflow-auto p-3 text-sm leading-[1.6] whitespace-pre-line text-text-primary select-text focus-visible:-outline-offset-2"
    >
      {current.lyrics.text}
    </section>
  );
}
