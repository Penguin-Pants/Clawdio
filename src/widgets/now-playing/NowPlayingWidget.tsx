import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { useAlbumArt } from "@/lib/art";
import { thumbUrl } from "@/lib/thumbs";
import { IconButton } from "@/components/icon-button";
import { useCurrentSong } from "@/shell/transport/use-current-song";
import { toggleFavorite, usePlaylistsStore } from "@/store/playlists";

/** The Now playing heart (R26, P11.7): a keyboard-reachable toggle. */
function Heart({ track }: { track: number }) {
  const favorite = usePlaylistsStore((state) => state.favorites.has(track));
  return (
    <IconButton
      icon="heart"
      label={favorite ? "Remove from Favorites" : "Add to Favorites"}
      aria-pressed={favorite}
      iconClassName={favorite ? "fill-current" : undefined}
      onClick={() => toggleFavorite(track)}
    />
  );
}

/** Now playing widget (R5): art, title, artist, album and the heart (P11 wires it). U5 makes it a card. */
export function NowPlayingWidget() {
  const song = useCurrentSong();
  // The 512 px display art (P10.3); the placeholder while it is made or when there is none.
  const art = useAlbumArt(song?.albumId ?? null, 512);
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
        <p className="flex-1 text-xs text-text-muted">Nothing playing</p>
      )}
      {song && <Heart track={song.id} />}
    </div>
  );
}
