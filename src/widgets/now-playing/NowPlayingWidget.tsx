import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { thumbUrl } from "@/lib/thumbs";
import { IconButton } from "@/components/icon-button";
import { commands, type SongRow } from "@/lib/ipc/commands";
import { useCommand } from "@/lib/ipc/hooks";
import { currentTrack, usePlayerStore } from "@/store/player";

/** Now playing widget (R5): art, title, artist, album and the heart (P11 wires it). */
export function NowPlayingWidget() {
  const track = usePlayerStore((state) => currentTrack(state.queue));
  const song = useCommand<SongRow | null>(
    () => (track === null ? Promise.resolve(null) : commands.libraryRows([track]).then((rows) => rows[0] ?? null)),
    null,
    [track],
  );
  const art = useCommand<string | null>(
    () => (track === null ? Promise.resolve(null) : commands.albumArt(track)),
    null,
    [track],
  );
  return (
    <div className="flex h-full items-center gap-3 p-2">
      {art ? (
        <img src={thumbUrl(art)} alt="" className="size-16 shrink-0 rounded-card object-cover" draggable={false} />
      ) : (
        <ArtPlaceholder className="size-16 shrink-0" />
      )}
      {song ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-lg">{song.title}</p>
          <p className="truncate text-[13px] text-text-secondary">
            {song.artistName} · {song.albumName}
          </p>
        </div>
      ) : (
        <p className="flex-1 text-[13px] text-text-muted">Nothing playing</p>
      )}
      {song && <IconButton icon="heart" label="Add to Favorites" disabled />}
    </div>
  );
}
