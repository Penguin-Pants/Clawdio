import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { commands, type Lyrics } from "@/lib/ipc/commands";
import { on } from "@/lib/ipc/events";
import { useCommand } from "@/lib/ipc/hooks";
import { currentTrack, usePlayerStore } from "@/store/player";
import { EmptyHint } from "../hint";

/** The lyrics read for a track (null: no source), or null when nothing plays. */
type Loaded = { track: number; lyrics: Lyrics | null } | null;

/**
 * Lyrics widget (R9, P13.4): the playing song's lyrics from its `.lrc` or `.txt` file or its
 * tags, read again on `lyrics-changed`. "Fetch lyrics" shows only when no source exists; P15
 * enables it.
 */
export function LyricsWidget() {
  const track = usePlayerStore((state) => currentTrack(state.queue));
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
        {current?.lyrics === null && (
          <Button variant="outline" size="sm" className="mx-3" disabled>
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
