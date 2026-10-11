import { commands, type Lyrics } from "@/lib/ipc/commands";
import { useCommand } from "@/lib/ipc/hooks";
import { currentTrack, usePlayerStore } from "@/store/player";
import { EmptyHint } from "../hint";

/** Lyrics widget (R9): the lyrics text of the current song. P13 adds the local sources. */
export function LyricsWidget() {
  const track = usePlayerStore((state) => currentTrack(state.queue));
  const lyrics = useCommand<Lyrics | null>(
    () => (track === null ? Promise.resolve(null) : commands.lyricsGet(track)),
    null,
    [track],
  );
  if (!lyrics) return <EmptyHint>No lyrics for this song.</EmptyHint>;
  return (
    <section
      aria-label="Lyrics text"
      tabIndex={0}
      className="size-full overflow-auto p-3 text-sm whitespace-pre-line text-text-primary focus-visible:-outline-offset-2"
    >
      {lyrics.text}
    </section>
  );
}
