import type { ReactNode } from "react";
import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { Icon } from "@/components/icons";
import type { RowFrame } from "@/components/virtual-list";
import { thumbUrl } from "@/lib/thumbs";
import type { AlbumRow, SongRow } from "@/lib/ipc/commands";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ROW_HEIGHT = 28;
export const ALBUM_ROW_HEIGHT = 48;

interface RowProps {
  frame: RowFrame;
  selected: boolean;
  onSelect?: () => void;
  /** Double-click: play (R6). */
  onActivate?: () => void;
  /** Right-click: the row's context menu (P6.6). */
  onMenu?: (row: HTMLElement) => void;
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
        onSelect?.();
        onMenu(event.currentTarget);
      }}
      className={cn(
        "flex cursor-default items-center gap-2 px-2 text-sm whitespace-nowrap select-none hover:bg-bg-hover",
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
}: {
  song: SongRow | undefined;
  showAlbum: boolean;
  playing?: boolean;
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
    </>
  );
}

/** A 40 px album thumbnail through the `thumb://` scheme (D27, D41), or the placeholder. */
export function AlbumThumb({ src }: { src: string | null }) {
  if (!src) return <ArtPlaceholder className="size-10 shrink-0" />;
  return <img src={thumbUrl(src)} alt="" className="size-10 shrink-0 rounded-card object-cover" draggable={false} />;
}

export function AlbumCells({ album }: { album: AlbumRow }) {
  return (
    <>
      <AlbumThumb src={album.thumb} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{album.name}</span>
        <span className="truncate text-[13px] text-text-secondary">{album.artistName}</span>
      </span>
    </>
  );
}
