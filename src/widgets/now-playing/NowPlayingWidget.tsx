import { useEffect, useRef, useState } from "react";
import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { IconButton } from "@/components/icon-button";
import { useAlbumArt } from "@/lib/art";
import { observeSize } from "@/lib/resize";
import { thumbUrl } from "@/lib/thumbs";
import { OverflowMenu } from "@/shell/transport/OverflowMenu";
import {
  NextButton,
  PlayPauseButton,
  PreviousButton,
  RepeatButton,
  ShuffleButton,
  StopButton,
} from "@/shell/transport/PlayControls";
import { SeekBar } from "@/shell/transport/SeekBar";
import { useCurrentSong } from "@/shell/transport/use-current-song";
import { toggleFavorite, usePlaylistsStore } from "@/store/playlists";

/** Below this card width, Stop, Shuffle and Repeat move to the card's More menu (U5). */
export const CARD_WIDE = 320;

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

/**
 * Now playing (R5, TR-11): a dockable card with the art, title, artist and album, the heart, the
 * seek bar with times and the play buttons. It uses the band's controls and the one player store,
 * so the card and the band always agree (rework 5.10). Below 320 px, Stop, Shuffle and Repeat are
 * in a More menu.
 */
export function NowPlayingWidget() {
  const song = useCurrentSong();
  // The 512 px display art (P10.3); the placeholder while it is made or when there is none.
  const art = useAlbumArt(song?.albumId ?? null, 512);
  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    return observeSize(element, (entry) => setWide(entry.contentRect.width >= CARD_WIDE));
  }, []);
  return (
    <div ref={rootRef} data-card="" className="flex h-full min-h-0 flex-col items-center gap-2 overflow-hidden p-3">
      <div className="flex min-h-0 w-full flex-1 justify-center">
        {art ? (
          <img
            src={thumbUrl(art)}
            alt=""
            className="aspect-square h-full max-w-full rounded-card object-cover"
            draggable={false}
          />
        ) : (
          <ArtPlaceholder className="aspect-square h-full max-w-full" />
        )}
      </div>
      <div className="flex w-full min-w-0 items-center gap-1">
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
      <SeekBar className="w-full" />
      <div className="flex items-center gap-1">
        {wide && <ShuffleButton />}
        <PreviousButton />
        <PlayPauseButton />
        <NextButton />
        {wide && <StopButton />}
        {wide && <RepeatButton />}
        {!wide && <OverflowMenu slots={["stop", "shuffle", "repeat"]} bandItems={false} />}
      </div>
    </div>
  );
}
