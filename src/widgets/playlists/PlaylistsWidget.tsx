import { type ReactNode, useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VirtualList } from "@/components/virtual-list";
import { commands, type ImportBatch, type PlaylistRow, type RepairBatch } from "@/lib/ipc/commands";
import { observeSize } from "@/lib/resize";
import { firstMatch, useTypeFind } from "@/lib/type-find";
import { revealLibrary } from "@/shell/layouts";
import { useLibraryStore } from "@/store/library";
import { playPlaylist, playlistTask, usePlaylistsStore } from "@/store/playlists";
import { useUiStore } from "@/store/ui";
import { EmptyHint } from "../hint";
import { Row, useRowHeight } from "../library/rows";
import { type RowMenuItem, useRowMenu } from "../row-menu";

/**
 * "Import playlist" and "Import folder" (P12.6, R32): the picker, the rescan and the import
 * run in Rust; then the combined report shows. Null means the user canceled the picker.
 */
function importPlaylists(run: () => Promise<ImportBatch | null>) {
  void playlistTask(
    "Importing playlists",
    run,
    (batch) => (batch ? { kind: "importReport", batch } : null),
    "Cannot import the playlists",
  );
}

/** "Find missing songs" (R33.3): the rescan and the repair run in Rust; then the report shows. */
function findMissing(run: () => Promise<RepairBatch>) {
  void playlistTask(
    "Finding missing songs",
    run,
    (batch) => ({ kind: "repairReport", batch }),
    "Cannot find missing songs",
  );
}

/** Below this width the widget shows the icon rail (SP-5, UD18). */
export const RAIL_WIDTH = 140;

/**
 * The icon rail (SP-5, UD18): one button per playlist, the heart for Favorites, with the name as
 * the tooltip and the accessible name. A button shows the playlist in the Library (R12 v1.9);
 * Enter and double-click also play it, as in the list (R25).
 */
function PlaylistRail({
  rows,
  onPick,
  onPlay,
}: {
  rows: PlaylistRow[];
  onPick: (id: number) => void;
  onPlay: (playlist: PlaylistRow) => void;
}) {
  return (
    <nav aria-label="Playlists" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
      {rows.map((playlist) => (
        <IconButton
          key={playlist.id}
          icon={playlist.isFavorites ? "heart" : "playlist"}
          label={playlist.name}
          size="icon"
          tooltip={playlist.name}
          data-drop-target={`playlist:${playlist.id}`}
          onClick={() => onPick(playlist.id)}
          onDoubleClick={() => onPlay(playlist)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onPick(playlist.id);
            onPlay(playlist);
          }}
        />
      ))}
    </nav>
  );
}

/**
 * Playlists widget (R12 v1.9, P11.5): the playlists in natural name order. A click shows the
 * playlist's songs in the Library; Enter and double-click play it (R25). The shown playlist is
 * the selected row.
 */
export function PlaylistsWidget() {
  const rowHeight = useRowHeight();
  const rows = usePlaylistsStore((state) => state.rows);
  const openDialog = useUiStore((state) => state.openDialog);
  const busy = usePlaylistsStore((state) => state.busy !== null);
  const busyText = usePlaylistsStore((state) => state.busy);
  const shown = useLibraryStore((state) => state.playlist);
  const showPlaylist = useLibraryStore((state) => state.showPlaylist);
  const show = (id: number) => {
    showPlaylist(id);
    revealLibrary();
  };
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  // The rail shows below RAIL_WIDTH, measured once per frame of resizes (UD24).
  const rootRef = useRef<HTMLDivElement>(null);
  const [rail, setRail] = useState(false);
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    return observeSize(element, (entry) => setRail(entry.contentRect.width < RAIL_WIDTH));
  }, []);
  // The active row is the playlist the Library shows.
  const found = rows.findIndex((row) => row.id === shown);
  const active = found >= 0 ? found : null;

  const play = (playlist: PlaylistRow) => void playPlaylist(playlist.id).catch(() => {});
  const items = (playlist: PlaylistRow): RowMenuItem[] => [
    { label: "Play", run: () => play(playlist) },
    ...(playlist.missingCount > 0
      ? [
          {
            label: "Find missing songs",
            run: busy ? undefined : () => findMissing(() => commands.playlistFindMissing(playlist.id)),
          },
        ]
      : []),
    {
      label: "Delete playlist",
      run: () => openDialog({ kind: "deletePlaylist", id: playlist.id, fileName: playlist.fileName }),
    },
  ];
  const current = active === null ? undefined : rows[active];
  // R36: the webview holds every playlist name, so it matches here (D65). A match shows the
  // playlist as Down does (R36.7). The icon rail has no list, so no type-to-find (R36.1).
  const [reveal, setReveal] = useState<{ index: number } | null>(null);
  const onType = useTypeFind({
    list: rows,
    find: (text) =>
      firstMatch(
        rows.map((row) => row.name),
        text,
      ),
    onMatch: (index) => {
      show(rows[index].id);
      setReveal({ index });
    },
  });
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (onType(event) || menu.fromKey(event, current ? items(current) : null)) return;
    if (current && event.key === "Enter") {
      event.preventDefault();
      play(current);
    }
  };

  const header = (
    <div className="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1">
      <Button variant="ghost" size="xs" onClick={() => openDialog({ kind: "newPlaylist" })}>
        New playlist
      </Button>
      <Button variant="ghost" size="xs" disabled={busy} onClick={() => importPlaylists(commands.playlistImport)}>
        Import playlist
      </Button>
      <Button variant="ghost" size="xs" disabled={busy} onClick={() => importPlaylists(commands.playlistImportFolder)}>
        Import folder
      </Button>
      <span aria-live="polite" className="truncate text-xs text-text-secondary">
        {busyText}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Playlist actions" />}
        >
          <Icon name="menu" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={busy} onClick={() => findMissing(commands.playlistFindMissingAll)}>
            Find missing songs in all playlists
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
  // One root element in every state, so the size observer keeps watching it.
  let body: ReactNode;
  if (rows.length === 0) {
    // The empty hint shows in the rail too, not a blank area (R5 empty widget rule).
    body = (
      <>
        {!rail && header}
        <EmptyHint>No playlists yet.</EmptyHint>
      </>
    );
  } else if (rail) {
    body = <PlaylistRail rows={rows} onPick={show} onPlay={play} />;
  } else {
    body = (
      <>
        {header}
        <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
          <VirtualList
            label="Playlists"
            role="listbox"
            count={rows.length}
            rowHeight={rowHeight}
            activeIndex={active}
            reveal={reveal}
            onMove={(index) => show(rows[index].id)}
            onKeyDown={onKeyDown}
            renderRow={(index, frame) => {
              const playlist = rows[index];
              return (
                <Row
                  key={playlist.id}
                  dropTarget={`playlist:${playlist.id}`}
                  frame={frame}
                  selected={shown === playlist.id}
                  onSelect={() => show(playlist.id)}
                  // A right-click selects without the tab switch, so the menu opens here.
                  onPick={() => showPlaylist(playlist.id)}
                  onActivate={() => play(playlist)}
                  onMenu={(anchor) => menu.open(anchor, items(playlist))}
                >
                  <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                  <span className="tabular text-xs text-text-muted">{playlist.entryCount}</span>
                </Row>
              );
            }}
          />
        </div>
        {menu.element}
      </>
    );
  }
  return (
    <div ref={rootRef} data-rail={rail ? "" : undefined} className="flex size-full flex-col">
      {body}
    </div>
  );
}
