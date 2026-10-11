import type { CSSProperties, ReactNode } from "react";
import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { thumbUrl } from "@/lib/thumbs";
import type { AlbumRow, SongRow } from "@/lib/ipc/commands";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ROW_HEIGHT = 28;
export const ALBUM_ROW_HEIGHT = 48;

interface RowProps {
  style: CSSProperties;
  selected: boolean;
  onSelect?: () => void;
  /** Double-click: play (R6). */
  onActivate?: () => void;
  role?: "option" | "treeitem";
  className?: string;
  children: ReactNode;
  /** Tree rows only. */
  level?: number;
  expanded?: boolean;
}

/**
 * A list row. Selected rows use `state.selected` and a 2 px `text.primary` bar at the left
 * (D10). Rows change background with no transition (C16).
 */
export function Row({
  style,
  selected,
  onSelect,
  onActivate,
  role = "option",
  className,
  children,
  level,
  expanded,
}: RowProps) {
  return (
    <div
      role={role}
      aria-selected={selected}
      aria-level={level}
      aria-expanded={expanded}
      data-row=""
      style={style}
      onClick={onSelect}
      onDoubleClick={onActivate}
      className={cn(
        "flex cursor-default items-center gap-2 px-2 text-sm whitespace-nowrap select-none hover:bg-bg-hover",
        selected && "bg-state-selected shadow-[inset_2px_0_0_var(--color-text-primary)] hover:bg-state-selected",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Song row content: title, the tag artist when it differs, the album where asked, and the duration. */
export function SongCells({ song, showAlbum }: { song: SongRow | undefined; showAlbum: boolean }) {
  if (!song) return <span className="text-text-muted">…</span>;
  return (
    <>
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
