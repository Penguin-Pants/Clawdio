import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { VirtualList } from "@/components/virtual-list";
import { commands, type PlaylistEntry } from "@/lib/ipc/commands";
import { useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { playPlaylist, removePlaylistEntry, usePlaylistsStore } from "@/store/playlists";
import { EmptyHint } from "../hint";
import { type RowMenuItem, useRowMenu } from "../row-menu";
import { Row, SongCells, useRowHeight } from "./rows";

const NO_ENTRIES: PlaylistEntry[] = [];

/**
 * The songs of one playlist in the Library, in playlist order (R12 v1.9): it takes the place of
 * the Artist, Album and Songs lists. Enter and double-click play from that entry, Delete removes
 * it (R25). A missing entry shows its saved label. A deleted playlist returns the Library to the
 * library.
 */
export function PlaylistView({ id }: { id: number }) {
  const rowHeight = useRowHeight();
  const playlist = usePlaylistsStore((state) => state.rows.find((row) => row.id === id));
  const listsLoaded = usePlaylistsStore((state) => state.version > 0);
  const version = usePlaylistsStore((state) => state.version);
  const libraryVersion = useLibraryStore((state) => state.version);
  const showPlaylist = useLibraryStore((state) => state.showPlaylist);
  // null while the first read runs; a failed read is not an empty playlist.
  const [loaded, setLoaded] = useState<PlaylistEntry[] | "failed" | null>(null);
  // The playlists version the shown entries were read at, and whether a removal of this view is
  // still on its way. They guard the removal only, so they are refs, read when it runs.
  const loadedAt = useRef<number | null>(null);
  const removing = useRef(false);
  const entries = Array.isArray(loaded) ? loaded : NO_ENTRIES;
  // The parent keys this view by playlist, so a new playlist starts with no active row.
  const [picked, setActive] = useState<number | null>(null);
  // After a removal the active row stays inside the shorter list.
  const active = picked === null || entries.length === 0 ? null : Math.min(picked, entries.length - 1);
  const { row, request } = useSongRows(libraryVersion);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);

  // The entries load for this playlist, and again after each playlist change.
  useEffect(() => {
    let current = true;
    const land = (result: PlaylistEntry[] | "failed") => {
      if (!current) return;
      setLoaded(result);
      loadedAt.current = version;
      removing.current = false;
    };
    commands.playlistEntries(id).then(land, () => land("failed"));
    return () => {
      current = false;
    };
  }, [id, version]);
  useEffect(() => {
    if (listsLoaded && !playlist) showPlaylist(null);
  }, [listsLoaded, playlist, showPlaylist]);

  const onRange = useCallback(
    (start: number, end: number) =>
      request(entries.slice(start, end + 1).flatMap((entry) => (entry.track === null ? [] : [entry.track]))),
    [entries, request],
  );
  const play = (index: number) => void playPlaylist(id, index, entries).catch(() => {});
  // The list goes away when the last entry goes or a read fails, after the menu or the key put
  // the focus back on it: the focus moves to the Library region instead of the page (AX-1).
  const noList = loaded === "failed" || (Array.isArray(loaded) && loaded.length === 0);
  useEffect(() => {
    const focused = document.activeElement;
    if (noList && (focused === null || focused === document.body)) {
      listRef.current?.closest<HTMLElement>('[data-widget="library"]')?.focus();
    }
  }, [noList]);
  /**
   * True while the shown indices may not match the playlist: from any `playlists-changed` until
   * the entries read after it land, and from a removal of this view until its new entries land.
   * It reads the live state, so a callback kept by an open menu checks it too (R25).
   */
  const stale = () => {
    const { reloading, version: now } = usePlaylistsStore.getState();
    return removing.current || reloading > 0 || loadedAt.current !== now;
  };
  const remove = (index: number) => {
    if (stale()) return;
    removing.current = true;
    void removePlaylistEntry(id, index).then((done) => {
      if (!done) removing.current = false;
    });
  };
  const items = (index: number): RowMenuItem[] => {
    const track = entries[index]?.track ?? null;
    return [
      { label: "Play", run: () => play(index) },
      {
        label: "Add to queue",
        run: track === null ? undefined : () => void commands.queueAppend([track]).catch(() => {}),
      },
      { label: "Remove from playlist", run: () => remove(index) },
    ];
  };

  if (!playlist) return null;
  return (
    <div ref={listRef} data-playlist-view={id} className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden="true" data-frame-label="" className="px-2 py-1 text-[13px] text-text-secondary">
        {playlist.name} · {playlist.entryCount === 1 ? "1 song" : `${playlist.entryCount} songs`}
      </div>
      {loaded === null ? null : loaded === "failed" ? (
        <EmptyHint>Cannot read this playlist.</EmptyHint>
      ) : entries.length === 0 ? (
        <EmptyHint>This playlist is empty. Add songs from the Library.</EmptyHint>
      ) : (
        <VirtualList
          label={`Songs in ${playlist.name}`}
          role="listbox"
          count={entries.length}
          rowHeight={rowHeight}
          onRange={onRange}
          activeIndex={active}
          onMove={setActive}
          onKeyDown={(event) => {
            if (menu.fromKey(event, active === null ? null : items(active))) return;
            if (active === null) return;
            if (event.key === "Enter") {
              event.preventDefault();
              play(active);
            } else if (event.key === "Delete") {
              event.preventDefault();
              remove(active);
            }
          }}
          renderRow={(index, frame) => {
            const entry = entries[index];
            return (
              <Row
                key={index}
                frame={frame}
                selected={active === index}
                onSelect={() => setActive(index)}
                onActivate={() => play(index)}
                onMenu={(anchor) => menu.open(anchor, items(index))}
              >
                <span className="tabular w-8 shrink-0 text-right text-xs text-text-muted">{index + 1}</span>
                {entry.track === null ? (
                  <>
                    <Icon name="missing" className="text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-text-muted">{entry.label}</span>
                    <span className="text-xs text-text-muted">missing</span>
                  </>
                ) : (
                  <SongCells song={row(entry.track)} showAlbum />
                )}
              </Row>
            );
          }}
        />
      )}
      {menu.element}
    </div>
  );
}
