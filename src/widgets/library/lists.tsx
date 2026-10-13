import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VirtualList } from "@/components/virtual-list";
import { commands, type TreeArtist } from "@/lib/ipc/commands";
import { useCommand, useRowCache, useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { currentTrack, usePlayerStore } from "@/store/player";
import { addToPlaylist, usePlaylistsStore } from "@/store/playlists";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { type RowMenuItem, useRowMenu } from "../row-menu";
import { AlbumCells, Row, SongCells, useAlbumRowHeight, useRowHeight } from "./rows";

const NO_IDS: number[] = [];
const NO_TREE: TreeArtist[] = [];

/** Plays `ids` from `start` (R6 queue rule). A failure leaves the player as it was. */
function playList(ids: number[], start: number) {
  if (start >= 0 && start < ids.length) void commands.playerPlayList(ids, start).catch(() => {});
}

/**
 * Plays a whole album or artist from `song`, or from the first song (R6: an album row plays
 * the album; in Tree mode a song plays its album). The search does not narrow it.
 */
function playScope(scope: { artist: number | null; album: number | null }, song?: number) {
  void commands.librarySongIds(scope, "").then(
    (ids) => playList(ids, song === undefined ? 0 : Math.max(0, ids.indexOf(song))),
    () => {},
  );
}

/** The track that plays or is paused, for the playing indicator (P6.4). */
function usePlayingTrack(): number | null {
  return usePlayerStore((state) => (state.player.status === "stopped" ? null : currentTrack(state.queue)));
}

/** Appends `ids` to the queue and says so in the status line, which shows with the queue hidden (R6). */
function addToQueue(ids: number[]) {
  if (ids.length === 0) return;
  void commands.queueAppend(ids).then(
    () => useUiStore.getState().showMessage("Added to queue"),
    () => {},
  );
}

/** Appends a whole album or artist to the queue. */
function addScope(scope: { artist: number | null; album: number | null }) {
  void commands.librarySongIds(scope, "").then(addToQueue, () => {});
}

/**
 * The "Add to playlist" submenu (P11.6): every playlist but Favorites (D20), then "New
 * playlist…", which creates one and adds the songs. `songs` gives the track ids on demand.
 */
function playlistItems(songs: () => Promise<number[]>): RowMenuItem[] {
  const add = (id: number) => () =>
    void songs().then(
      (ids) => addToPlaylist(id, ids),
      () => {},
    );
  const create = () =>
    void songs().then(
      (ids) => useUiStore.getState().openDialog({ kind: "newPlaylist", addTracks: ids }),
      () => {},
    );
  return [
    ...usePlaylistsStore
      .getState()
      .rows.filter((row) => !row.isFavorites)
      .map((row) => ({ label: row.name, run: add(row.id) })),
    { label: "New playlist…", run: create },
  ];
}

/** The Library row menu (R6, P7.10, P11.6): Play, Add to queue and Add to playlist. */
function rowItems(play: (() => void) | null, add: () => void, songs: () => Promise<number[]>): RowMenuItem[] | null {
  if (!play) return null;
  return [
    { label: "Play", run: play },
    { label: "Add to queue", run: add },
    { label: "Add to playlist", items: playlistItems(songs) },
  ];
}

/** The songs of an album or artist, for the menus. */
const scopeSongs = (scope: { artist: number | null; album: number | null }) => () => commands.librarySongIds(scope, "");

/**
 * "Set cover" (P10.4): Rust opens the picker and asks before it replaces `cover.jpg`. An
 * error (a read-only folder) shows in the status line; the new art arrives by `art-ready`.
 */
function setCover(album: number) {
  void commands.setCover(album).catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
    useUiStore.getState().showMessage(message || "Cannot set the cover");
  });
}

/**
 * "Retry lookup" (P14.7): Rust clears the album's marker and looks it up; the result shows in
 * the status line.
 */
function retryLookup(album: number) {
  void commands.albumRetryLookup(album).catch((error: unknown) => {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
    useUiStore.getState().showMessage(message || "Cannot look up the album");
  });
}

/**
 * "Fill missing metadata" (P16): Rust looks the album up and returns a preview; the dialog
 * writes nothing until Confirm.
 */
function fillMetadata(album: number) {
  void commands
    .metadataPreview(album)
    .then((preview) => {
      if (preview) useUiStore.getState().openDialog({ kind: "metadataPreview", album, preview });
    })
    .catch((error: unknown) => {
      const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
      useUiStore.getState().showMessage(message || "Cannot look up the album");
    });
}

/** The group of songs outside an album folder (R3); it has no album to look up. */
const UNKNOWN_ALBUM = "Unknown Album";

/**
 * The album row menu: the Library items, "Set cover", and "Retry lookup" and "Fill missing
 * metadata" (off without Online lookups; the fill is also off for the Unknown group).
 */
function albumItems(
  album: number,
  name: string | undefined,
  play: (() => void) | null,
  add: () => void,
): RowMenuItem[] | null {
  const items = rowItems(play, add, scopeSongs({ artist: null, album }));
  const online = useSettingsStore.getState().view.onlineLookups;
  return (
    items && [
      ...items,
      { label: "Set cover", run: () => setCover(album) },
      { label: "Retry lookup", run: online ? () => retryLookup(album) : undefined },
      {
        label: "Fill missing metadata",
        run: online && name !== undefined && name !== UNKNOWN_ALBUM ? () => fillMetadata(album) : undefined,
      },
    ]
  );
}

/** Artist list with an "All" row first (R28). Rows load for the visible window (D14). */
export function ArtistList() {
  const rowHeight = useRowHeight();
  const search = useLibraryStore((state) => state.search);
  const selected = useLibraryStore((state) => state.selection.artist);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const ids = useCommand(() => commands.libraryArtists(search), NO_IDS, [search, version]);
  const { row, request } = useRowCache(commands.libraryArtistRows, version);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const onRange = useCallback(
    (start: number, end: number) => request(ids.slice(Math.max(0, start - 1), end)),
    [ids, request],
  );
  const idAt = (index: number) => (index === 0 ? null : (ids[index - 1] ?? null));
  const select = (id: number | null) => setSelection({ artist: id, album: null, song: null });
  const play = (id: number | null) => (id === null ? null : () => playScope({ artist: id, album: null }));
  const items = (id: number | null) =>
    rowItems(play(id), () => addScope({ artist: id, album: null }), scopeSongs({ artist: id, album: null }));
  // A search that hides the selected artist selects "All", so no hidden row filters the lists.
  useEffect(() => {
    if (ids !== NO_IDS && selected !== null && !ids.includes(selected)) {
      setSelection({ artist: null, album: null, song: null });
    }
  }, [ids, selected, setSelection]);
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Artists"
        role="listbox"
        count={ids.length + 1}
        rowHeight={rowHeight}
        onRange={onRange}
        activeIndex={selected === null ? 0 : ids.indexOf(selected) + 1}
        onMove={(index) => select(idAt(index))}
        onKeyDown={(event) => menu.fromKey(event, items(selected))}
        renderRow={(index, frame) => {
          const id = idAt(index);
          const rowMenu = items(id);
          return (
            <Row
              key={id ?? "all"}
              frame={frame}
              selected={selected === id}
              onSelect={() => select(id)}
              onMenu={rowMenu ? (anchor) => menu.open(anchor, items(id) ?? rowMenu) : undefined}
            >
              <span className="truncate">{id === null ? "All" : (row(id)?.name ?? "…")}</span>
            </Row>
          );
        }}
      />
      {menu.element}
    </div>
  );
}

/** Album list of the selected artist with an "All" row first. Rows load for the visible window (D14). */
export function AlbumList() {
  const rowHeight = useAlbumRowHeight();
  const search = useLibraryStore((state) => state.search);
  const artist = useLibraryStore((state) => state.selection.artist);
  const selected = useLibraryStore((state) => state.selection.album);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const ids = useCommand(() => commands.libraryAlbums(artist, search), NO_IDS, [artist, search, version]);
  const { row, request } = useRowCache(commands.libraryAlbumRows, version);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const onRange = useCallback(
    (start: number, end: number) => request(ids.slice(Math.max(0, start - 1), end)),
    [ids, request],
  );
  const idAt = (index: number) => (index === 0 ? null : (ids[index - 1] ?? null));
  const select = (id: number | null) => setSelection({ album: id, song: null });
  // An album row plays the album from its first song (P6.5).
  const play = (id: number | null) => (id === null ? null : () => playScope({ artist: null, album: id }));
  const items = (id: number | null) =>
    id === null ? null : albumItems(id, row(id)?.name, play(id), () => addScope({ artist: null, album: id }));
  // A search or an artist change that hides the selected album selects "All".
  useEffect(() => {
    if (ids !== NO_IDS && selected !== null && !ids.includes(selected)) setSelection({ album: null, song: null });
  }, [ids, selected, setSelection]);
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Albums"
        role="listbox"
        count={ids.length + 1}
        rowHeight={rowHeight}
        onRange={onRange}
        activeIndex={selected === null ? 0 : ids.indexOf(selected) + 1}
        onMove={(index) => select(idAt(index))}
        onKeyDown={(event) => {
          if (menu.fromKey(event, items(selected))) return;
          if (event.key === "Enter") {
            event.preventDefault();
            play(selected)?.();
          }
        }}
        renderRow={(index, frame) => {
          const id = idAt(index);
          const album = id === null ? undefined : row(id);
          const playRow = play(id);
          const rowMenu = items(id);
          return (
            <Row
              key={id ?? "all"}
              frame={frame}
              selected={selected === id}
              onSelect={() => select(id)}
              onActivate={playRow ?? undefined}
              onMenu={rowMenu ? (anchor) => menu.open(anchor, items(id) ?? rowMenu) : undefined}
            >
              {id === null ? <span className="pl-12">All</span> : album ? <AlbumCells album={album} /> : <span>…</span>}
            </Row>
          );
        }}
      />
      {menu.element}
    </div>
  );
}

/** Songs of the selected artist and album, or all songs (R28). Rows load for the visible window. */
export function SongList({ showAlbum }: { showAlbum: boolean }) {
  const rowHeight = useRowHeight();
  const search = useLibraryStore((state) => state.search);
  const artist = useLibraryStore((state) => state.selection.artist);
  const album = useLibraryStore((state) => state.selection.album);
  const selected = useLibraryStore((state) => state.selection.song);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const playing = usePlayingTrack();
  const ids = useCommand(() => commands.librarySongIds({ artist, album }, search), NO_IDS, [
    artist,
    album,
    search,
    version,
  ]);
  const { row, request } = useSongRows(version);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const onRange = useCallback((start: number, end: number) => request(ids.slice(start, end + 1)), [ids, request]);
  const active = selected === null ? -1 : ids.indexOf(selected);
  // Playing a song sets the queue to the Songs list as shown (R6 queue rule).
  const play = (index: number) => () => playList(ids, index);
  const items = (index: number) =>
    rowItems(
      play(index),
      () => addToQueue([ids[index]]),
      async () => [ids[index]],
    );
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Songs"
        role="listbox"
        count={ids.length}
        rowHeight={rowHeight}
        onRange={onRange}
        activeIndex={active >= 0 ? active : null}
        onMove={(index) => setSelection({ song: ids[index] ?? null })}
        onKeyDown={(event) => {
          if (menu.fromKey(event, active >= 0 ? items(active) : null)) return;
          if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            play(active)();
          }
        }}
        renderRow={(index, frame) => {
          const id = ids[index];
          return (
            <Row
              key={id}
              frame={frame}
              selected={selected === id}
              onSelect={() => setSelection({ song: id })}
              onActivate={play(index)}
              onMenu={(anchor) => menu.open(anchor, items(index) ?? [])}
            >
              <SongCells song={row(id)} showAlbum={showAlbum} playing={playing === id} heart />
            </Row>
          );
        }}
      />
      {menu.element}
    </div>
  );
}

type TreeLine = { posinset: number; setsize: number } & (
  | { kind: "artist"; id: number; name: string; expanded: boolean }
  | { kind: "album"; id: number; artist: number; name: string; expanded: boolean }
  | { kind: "song"; id: number; artist: number; album: number }
);

const LEVEL = { artist: 1, album: 2, song: 3 } as const;

/** The tree as lines: artists, the albums of open artists, the songs of open albums. */
export function treeLines(tree: TreeArtist[], openArtists: Set<number>, openAlbums: Set<number>): TreeLine[] {
  const lines: TreeLine[] = [];
  tree.forEach((artist, artistIndex) => {
    const artistOpen = openArtists.has(artist.id);
    lines.push({
      kind: "artist",
      id: artist.id,
      name: artist.name,
      expanded: artistOpen,
      posinset: artistIndex + 1,
      setsize: tree.length,
    });
    if (!artistOpen) return;
    artist.albums.forEach((album, albumIndex) => {
      const albumOpen = openAlbums.has(album.id);
      lines.push({
        kind: "album",
        id: album.id,
        artist: artist.id,
        name: album.name,
        expanded: albumOpen,
        posinset: albumIndex + 1,
        setsize: artist.albums.length,
      });
      if (!albumOpen) return;
      album.songs.forEach((id, songIndex) =>
        lines.push({
          kind: "song",
          id,
          artist: artist.id,
          album: album.id,
          posinset: songIndex + 1,
          setsize: album.songs.length,
        }),
      );
    });
  });
  return lines;
}

/** One expandable artist, album and song tree (R28). Song rows load for the visible window. */
export function TreeList() {
  const rowHeight = useRowHeight();
  const search = useLibraryStore((state) => state.search);
  const selection = useLibraryStore((state) => state.selection);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const playing = usePlayingTrack();
  const tree = useCommand(() => commands.libraryTree(search), NO_TREE, [search, version]);
  const [openArtists, setOpenArtists] = useState(() => new Set<number>());
  const [openAlbums, setOpenAlbums] = useState(() => new Set<number>());
  const { row, request } = useSongRows(version);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const lines = useMemo(() => treeLines(tree, openArtists, openAlbums), [tree, openArtists, openAlbums]);
  const setOpen = (line: TreeLine, open: boolean) => {
    const update = (set: Set<number>) => {
      const next = new Set(set);
      if (open) next.add(line.id);
      else next.delete(line.id);
      return next;
    };
    if (line.kind === "artist") setOpenArtists(update);
    else if (line.kind === "album") setOpenAlbums(update);
  };
  const select = (line: TreeLine) => {
    if (line.kind === "artist") setSelection({ artist: line.id, album: null, song: null });
    else if (line.kind === "album") setSelection({ artist: line.artist, album: line.id, song: null });
    else setSelection({ artist: line.artist, album: line.album, song: line.id });
  };
  // In Tree mode a song plays its whole album, from that song (R6 queue rule).
  const play = (line: TreeLine | undefined) => {
    if (line?.kind === "song") return () => playScope({ artist: null, album: line.album }, line.id);
    if (line?.kind === "album") return () => playScope({ artist: null, album: line.id });
    return null;
  };
  const items = (line: TreeLine | undefined) => {
    if (line?.kind === "album") {
      return albumItems(line.id, line.name, play(line), () => addScope({ artist: null, album: line.id }));
    }
    return rowItems(
      play(line),
      () => {
        if (line?.kind === "song") addToQueue([line.id]);
      },
      async () => (line?.kind === "song" ? [line.id] : []),
    );
  };
  const active = lines.findIndex((line) =>
    selection.song !== null
      ? line.kind === "song" &&
        line.id === selection.song &&
        (selection.album === null || line.album === selection.album)
      : selection.album !== null
        ? line.kind === "album" && line.id === selection.album
        : line.kind === "artist" && line.id === selection.artist,
  );
  // A selection from another mode opens its artist and album, so it shows (R28, P6-AC2).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || tree === NO_TREE) return;
    opened.current = true;
    const open = (artist: number, album: number | null) => {
      setOpenArtists((set) => new Set(set).add(artist));
      if (album !== null) setOpenAlbums((set) => new Set(set).add(album));
    };
    if (selection.song !== null) {
      void commands.libraryRows([selection.song]).then(
        ([song]) => song && open(song.artistId, song.albumId),
        () => {},
      );
    } else if (selection.album !== null) {
      const owner = tree.find((artist) => artist.albums.some((album) => album.id === selection.album));
      if (owner) open(owner.id, selection.album);
    } else if (selection.artist !== null) {
      open(selection.artist, null);
    }
  }, [tree, selection]);
  const onRange = useCallback(
    (start: number, end: number) =>
      request(
        lines
          .slice(start, end + 1)
          .filter((line) => line.kind === "song")
          .map((line) => line.id),
      ),
    [lines, request],
  );
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const line = lines[active];
    if (menu.fromKey(event, items(line))) return;
    if (!line) return;
    if (event.key === "Enter") {
      event.preventDefault();
      play(line)?.();
    } else if (event.key === "ArrowRight" && line.kind !== "song") {
      event.preventDefault();
      if (!line.expanded) setOpen(line, true);
      else if (lines[active + 1]) select(lines[active + 1]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (line.kind !== "song" && line.expanded) {
        setOpen(line, false);
        return;
      }
      for (let index = active - 1; index >= 0; index -= 1) {
        if (LEVEL[lines[index].kind] < LEVEL[line.kind]) {
          select(lines[index]);
          return;
        }
      }
    }
  };
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Library"
        role="tree"
        count={lines.length}
        rowHeight={rowHeight}
        onRange={onRange}
        activeIndex={active >= 0 ? active : null}
        onMove={(index) => select(lines[index])}
        place={(index) => ({ posinset: lines[index].posinset, setsize: lines[index].setsize })}
        onKeyDown={onKeyDown}
        renderRow={(index, frame) => {
          const line = lines[index];
          const playLine = play(line);
          const lineMenu = items(line);
          const onMenu = lineMenu ? (anchor: HTMLElement) => menu.open(anchor, items(line) ?? lineMenu) : undefined;
          if (line.kind === "song") {
            return (
              <Row
                key={`s${line.album}-${line.id}`}
                role="treeitem"
                level={3}
                frame={frame}
                className="pl-12"
                selected={selection.song === line.id}
                onSelect={() => select(line)}
                onActivate={playLine ?? undefined}
                onMenu={onMenu}
              >
                <SongCells song={row(line.id)} showAlbum={false} playing={playing === line.id} heart />
              </Row>
            );
          }
          const isArtist = line.kind === "artist";
          return (
            <Row
              key={`${line.kind}${line.id}`}
              role="treeitem"
              level={isArtist ? 1 : 2}
              expanded={line.expanded}
              frame={frame}
              className={isArtist ? undefined : "pl-6"}
              selected={
                isArtist ? selection.artist === line.id && selection.album === null : selection.album === line.id
              }
              onSelect={() => {
                setOpen(line, !line.expanded);
                select(line);
              }}
              onPick={() => select(line)}
              onActivate={playLine ?? undefined}
              onMenu={onMenu}
            >
              <span className="truncate">{line.name}</span>
            </Row>
          );
        }}
      />
      {menu.element}
    </div>
  );
}
