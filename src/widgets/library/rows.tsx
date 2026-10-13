import type { ReactNode } from "react";
import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { Icon } from "@/components/icons";
import type { RowFrame } from "@/components/virtual-list";
import { useAlbumArt } from "@/lib/art";
import { useTokenPx } from "@/lib/tokens";
import { thumbUrl } from "@/lib/thumbs";
import type { AlbumRow, SongRow } from "@/lib/ipc/commands";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toggleFavorite, usePlaylistsStore } from "@/store/playlists";

/** The height of a list row in px, from the `sizes.rowRegular` token (TH-1, UD1). */
export function useRowHeight(): number {
  return useTokenPx("--size-row-regular");
}

/** The height of an Album row in px, from the `sizes.rowAlbum` token (UD1). */
export function useAlbumRowHeight(): number {
  return useTokenPx("--size-row-album");
}

interface RowProps {
  frame: RowFrame;
  selected: boolean;
  onSelect?: () => void;
  /** Double-click: play (R6). */
  onActivate?: () => void;
  /** Right-click: the row's context menu (P6.6). */
  onMenu?: (row: HTMLElement) => void;
  /** Selects the row for the context menu without other click effects. Defaults to `onSelect`. */
  onPick?: () => void;
  role?: "option" | "treeitem";
  className?: string;
  children: ReactNode;
  /** Tree rows only. */
  level?: number;
  expanded?: boolean;
}

/**
 * A list row. Selected rows use `state.selected` and a 2 px `text.primary` bar at the left
 * (D10). The active row shows a 2 px inset `text.primary` outline while its list has focus
 * (P6.6). Rows change background with no transition (C16).
 */
export function Row({
  frame,
  selected,
  onSelect,
  onActivate,
  onMenu,
  onPick,
  role = "option",
  className,
  children,
  level,
  expanded,
}: RowProps) {
  return (
    <div
      id={frame.id}
      role={role}
      aria-selected={selected}
      aria-level={level}
      aria-expanded={expanded}
      aria-posinset={frame.posinset}
      aria-setsize={frame.setsize}
      data-row=""
      data-active={frame.active ? "" : undefined}
      style={frame.style}
      onClick={onSelect}
      onDoubleClick={onActivate}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        (onPick ?? onSelect)?.();
        onMenu(event.currentTarget);
      }}
      className={cn(
        "group/row flex cursor-default items-center gap-2 px-2 text-sm whitespace-nowrap select-none hover:bg-bg-hover",
        selected && "bg-state-selected shadow-[inset_2px_0_0_var(--color-text-primary)] hover:bg-state-selected",
        "group-focus/list:data-active:outline-2 group-focus/list:data-active:-outline-offset-2 group-focus/list:data-active:outline-text-primary group-focus/list:data-active:outline-solid",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Song row content: title, the tag artist when it differs, the album where asked, and the
 * duration. The playing song shows the playing icon and a "Playing" label (P6.4).
 */
export function SongCells({
  song,
  showAlbum,
  playing = false,
  heart = false,
}: {
  song: SongRow | undefined;
  showAlbum: boolean;
  playing?: boolean;
  /** The Favorites heart (R26), on Library song rows. */
  heart?: boolean;
}) {
  if (!song) return <span className="text-text-muted">…</span>;
  return (
    <>
      {playing && (
        <span className="flex shrink-0 items-center">
          <Icon name="playing" className="text-text-primary" />
          <span className="sr-only">Playing</span>
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {song.title}
        {song.tagArtist && <span className="text-[13px] text-text-secondary"> · {song.tagArtist}</span>}
      </span>
      {showAlbum && <span className="max-w-[40%] truncate text-[13px] text-text-secondary">{song.albumName}</span>}
      <span className="tabular text-xs text-text-muted">{formatDuration(song.durationMs)}</span>
      {heart && <RowHeart track={song.id} />}
    </>
  );
}

/**
 * The heart on a song row (R26, D23): a pointer target only. It is not a button in the
 * accessibility tree, because a control inside a list option breaks the listbox pattern;
 * keyboard and screen reader users use the Now playing heart. A filled heart marks a
 * favorite; the empty one shows on row hover.
 */
function RowHeart({ track }: { track: number }) {
  const favorite = usePlaylistsStore((state) => state.favorites.has(track));
  return (
    <span
      aria-hidden="true"
      data-slot="row-heart"
      data-favorite={favorite ? "" : undefined}
      title={favorite ? "Remove from Favorites" : "Add to Favorites"}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-text-secondary hover:text-text-primary",
        !favorite && "opacity-0 group-hover/row:opacity-100",
      )}
      onClick={(event) => {
        event.stopPropagation();
        toggleFavorite(track);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Icon name="heart" className={cn("size-3.5", favorite && "fill-current text-text-primary")} />
    </span>
  );
}

/**
 * A 40 px album thumbnail (the 96 px file) through the `thumb://` scheme (D27, D41), or the
 * placeholder while it is made or when the album has no art (P10.3).
 */
export function AlbumThumb({ album }: { album: number }) {
  const src = useAlbumArt(album, 96);
  // No pointer target: the art can replace the placeholder between mouse down and up, and
  // WebKit drops a click whose mouse-down node left the page. The row takes the click.
  if (!src) return <ArtPlaceholder className="pointer-events-none size-10 shrink-0" />;
  return (
    <img
      src={thumbUrl(src)}
      alt=""
      className="pointer-events-none size-10 shrink-0 rounded-card object-cover"
      draggable={false}
    />
  );
}

export function AlbumCells({ album }: { album: AlbumRow }) {
  return (
    <>
      <AlbumThumb album={album.id} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{album.name}</span>
        <span className="truncate text-[13px] text-text-secondary">{album.artistName}</span>
      </span>
    </>
  );
}
