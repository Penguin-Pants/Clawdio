import { memo, type ReactNode } from "react";
import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { Icon } from "@/components/icons";
import type { RowFrame } from "@/components/virtual-list";
import { useAlbumArt } from "@/lib/art";
import { useColumnsStore } from "@/store/columns";
import { useTokenPx } from "@/lib/tokens";
import { thumbUrl } from "@/lib/thumbs";
import type { AlbumRow, SongRow } from "@/lib/ipc/commands";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { COLUMNS, type ColumnId } from "./columns";
import { takeDragClick } from "./row-drag";
import { toggleFavorite, usePlaylistsStore } from "@/store/playlists";

/** The height of a list row in px, from the `sizes.rowRegular` token (TH-1, UD1). */
export function useRowHeight(): number {
  // Compact rows (TB-14) for every list but the album rows (`useAlbumRowHeight`).
  const compact = useColumnsStore((state) => state.density === "compact");
  return useTokenPx(compact ? "--size-row-compact" : "--size-row-regular");
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
  /** `data-drop-target` for a row drag (TB-12): a playlist row takes songs. */
  dropTarget?: string;
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
  dropTarget,
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
      data-drop-target={dropTarget}
      onClick={onSelect}
      onDoubleClick={onActivate}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        (onPick ?? onSelect)?.();
        onMenu(event.currentTarget);
      }}
      className={cn(
        "group/row flex h-full cursor-default items-center gap-2 px-2 text-sm whitespace-nowrap select-none hover:bg-bg-hover",
        selected && SELECTED,
        ROW_STATE,
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

/** The modifier keys of a row click (UD12): Shift for a range, Ctrl (or Cmd) to toggle. */
export interface ClickModifiers {
  shift: boolean;
  ctrl: boolean;
}

/** The selected and active row look, shared by `Row` and `SongTableRow` (D10, P6.6). */
const ROW_STATE =
  "group-focus/list:data-active:outline-2 group-focus/list:data-active:-outline-offset-2 group-focus/list:data-active:outline-text-primary group-focus/list:data-active:outline-solid";
const SELECTED = "bg-state-selected shadow-[inset_2px_0_0_var(--color-text-primary)] hover:bg-state-selected";

interface SongTableRowProps {
  /** The element id for `aria-activedescendant`. */
  rowId: string;
  index: number;
  active: boolean;
  selected: boolean;
  playing: boolean;
  song: SongRow | undefined;
  /** The visible column ids in order; the same array until the column state changes. */
  columns: readonly ColumnId[];
  /** `grid-template-columns`, shared with the header (UD9). */
  template: string;
  onSelect: (index: number, modifiers: ClickModifiers) => void;
  onActivate: (index: number) => void;
  onMenu: (index: number, row: HTMLElement) => void;
  /** A pointer down that may start a row drag (TB-12). */
  onRowPointerDown?: (index: number, event: PointerEvent) => void;
}

/** One cell's text per column (UD8): `#` shows the playing indicator for the playing row (TB-11). */
function SongCell({ column, song, playing }: { column: ColumnId; song: SongRow; playing: boolean }) {
  switch (column) {
    case "track":
      return playing ? (
        <>
          <Icon name="playing" className="ml-auto text-text-primary" />
          <span className="sr-only">Playing</span>
        </>
      ) : (
        <span className="tabular text-xs text-text-muted">{song.trackNo ?? ""}</span>
      );
    case "title":
      return <span className="truncate">{song.title}</span>;
    case "artist":
      return <span className="truncate text-[13px] text-text-secondary">{song.tagArtist ?? song.artistName}</span>;
    case "album":
      return <span className="truncate text-[13px] text-text-secondary">{song.albumName}</span>;
    case "duration":
      return <span className="tabular text-xs text-text-muted">{formatDuration(song.durationMs)}</span>;
  }
}

/**
 * A Songs table row (UD8, UD9): a grid row of grid cells laid out by the shared template. It
 * takes primitives and stable callbacks only, so a container resize does not render it again
 * (PF-1). The heart is a trailing cell that is not a user column (D23).
 */
export const SongTableRow = memo(function SongTableRow({
  rowId,
  index,
  active,
  selected,
  playing,
  song,
  columns,
  template,
  onSelect,
  onActivate,
  onMenu,
  onRowPointerDown,
}: SongTableRowProps) {
  return (
    <div
      id={rowId}
      role="row"
      aria-rowindex={index + 2}
      aria-selected={selected}
      data-row=""
      data-active={active ? "" : undefined}
      onPointerDown={(event) => onRowPointerDown?.(index, event.nativeEvent)}
      onClick={(event) => {
        // The click that ends a row drag does not select (UD21).
        if (takeDragClick()) return;
        onSelect(index, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey });
      }}
      onDoubleClick={() => onActivate(index)}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(index, event.currentTarget);
      }}
      style={{ gridTemplateColumns: template }}
      className={cn(
        "group/row grid h-full cursor-default items-center text-sm whitespace-nowrap select-none hover:bg-bg-hover",
        selected && SELECTED,
        ROW_STATE,
      )}
    >
      {columns.map((column) => (
        <div
          key={column}
          role="gridcell"
          data-col={column}
          className={cn("flex min-w-0 items-center px-2", COLUMNS[column].align === "right" && "justify-end")}
        >
          {song ? <SongCell column={column} song={song} playing={playing} /> : column === "title" && "…"}
        </div>
      ))}
      <div role="gridcell" className="flex items-center justify-center">
        {song && <RowHeart track={song.id} />}
      </div>
    </div>
  );
});

/**
 * The heart on a song row (R26, D23): a pointer target only. It is not a button in the
 * accessibility tree, because a control inside a list option breaks the listbox pattern;
 * keyboard and screen reader users use the row menu (Add to Favorites, UD8) or the Now playing
 * heart. A filled heart marks a
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
