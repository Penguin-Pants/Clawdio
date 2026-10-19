import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { VirtualList } from "@/components/virtual-list";
import { commands, type PlaylistEntry } from "@/lib/ipc/commands";
import { useSongRows } from "@/lib/ipc/hooks";
import { shownIndex, useTypeFind } from "@/lib/type-find";
import { useLibraryStore } from "@/store/library";
import { currentTrack, usePlayerStore } from "@/store/player";
import { playPlaylist, removePlaylistEntry, usePlaylistsStore } from "@/store/playlists";
import { playlistFollowRow, useFollowPlaying } from "../follow";
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
  // The guard of the index actions. They are refs, read when an action runs:
  // - `loadedAt`: the playlists version the shown entries were read at;
  // - `started` and `landed`: the number of the last entry read started and landed;
  // - `needRead`: a read with at least this number must land before the next index action
  //   (set after a removal of this view);
  // - `removing`: a removal of this view is on its way.
  const loadedAt = useRef<number | null>(null);
  const started = useRef(0);
  const landed = useRef(0);
  const needRead = useRef(0);
  const removing = useRef(false);
  // Goes up after a removal of this view, so the entries load again after it.
  const [refresh, setRefresh] = useState(0);
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
    started.current += 1;
    const read = started.current;
    const land = (result: PlaylistEntry[] | "failed") => {
      if (!current) return;
      setLoaded(result);
      loadedAt.current = version;
      landed.current = read;
    };
    commands.playlistEntries(id).then(land, () => land("failed"));
    return () => {
      current = false;
    };
  }, [id, version, refresh]);
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
   * the entries read after it land, and from a removal of this view until the entries read after
   * it land. It reads the live state, so a callback kept by an open menu checks it too (R25).
   */
  const stale = () => {
    const { reloading, version: now } = usePlaylistsStore.getState();
    return removing.current || landed.current < needRead.current || reloading > 0 || loadedAt.current !== now;
  };
  const [reveal, setReveal] = useState<{ index: number } | null>(null);
  useFollowPlaying(
    listRef,
    () => {
      const { queue, playlistSource } = usePlayerStore.getState();
      const track = currentTrack(queue);
      const fromThisView = playlistSource?.id === id;
      const target =
        track === null || queue.current === null
          ? null
          : playlistFollowRow(entries, { track, current: queue.current }, fromThisView);
      return { hasSelection: active !== null, target, busy: stale() };
    },
    (index) => {
      setActive(index);
      setReveal({ index });
    },
  );
  // R36: Title in Rust; a missing entry has no title (D65). A stale list finds nothing.
  const onType = useTypeFind({
    list: entries,
    find: (text) =>
      stale()
        ? null
        : commands.libraryFind({ kind: "playlist", id }, text).then((hit) => shownIndex(hit, (i) => entries[i]?.track)),
    onMatch: (index) => {
      setActive(index);
      setReveal({ index });
    },
  });
  const remove = (index: number) => {
    if (stale()) return;
    removing.current = true;
    void removePlaylistEntry(id, index).then((done) => {
      removing.current = false;
      if (!done) return;
      // Only a read started after the removal shows it.
      needRead.current = started.current + 1;
      setRefresh((count) => count + 1);
    });
  };
  /**
   * The row menu keeps its items while it is open. Each item runs only when the entries it was
   * made from are still the shown ones and not stale, so no item acts on another song (R25).
   */
  const items = (index: number): RowMenuItem[] => {
    const track = entries[index]?.track ?? null;
    const madeFrom = landed.current;
    const fresh = (run: () => void) => () => {
      if (landed.current === madeFrom && !stale()) run();
    };
    return [
      { label: "Play", run: fresh(() => play(index)) },
      {
        label: "Add to queue",
        run: track === null ? undefined : fresh(() => void commands.queueAppend([track]).catch(() => {})),
      },
      { label: "Remove from playlist", run: fresh(() => remove(index)) },
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
          reveal={reveal}
          onMove={setActive}
          onKeyDown={(event) => {
            if (onType(event) || menu.fromKey(event, active === null ? null : items(active))) return;
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
