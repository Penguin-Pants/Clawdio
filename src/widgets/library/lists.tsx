import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { VirtualList } from "@/components/virtual-list";
import { commands, type TreeArtist } from "@/lib/ipc/commands";
import { useCommand, useRowCache, useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { currentTrack, usePlayerStore } from "@/store/player";
import { ALBUM_ROW_HEIGHT, AlbumCells, ROW_HEIGHT, Row, SongCells } from "./rows";

const NO_IDS: number[] = [];
const NO_TREE: TreeArtist[] = [];

/** Plays `ids` from `start` (R6 queue rule). A failure leaves the player as it was. */
function playList(ids: number[], start: number) {
  if (start >= 0 && start < ids.length) void commands.playerPlayList(ids, start).catch(() => {});
}

/** Plays the songs of an album or an artist as the Library shows them, from the first (P6.5). */
function playScope(scope: { artist: number | null; album: number | null }, search: string) {
  void commands.librarySongIds(scope, search).then(
    (ids) => playList(ids, 0),
    () => {},
  );
}

/** The track that plays or is paused, for the playing indicator (P6.4). */
function usePlayingTrack(): number | null {
  return usePlayerStore((state) => (state.player.status === "stopped" ? null : currentTrack(state.queue)));
}

/** True for the keys that open the context menu of the active row (R25, P6-AC10). */
function isMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

interface MenuRequest {
  anchor: HTMLElement;
  play: () => void;
}

/** The row context menu. P7 adds "Add to queue" and P11 "Add to playlist". */
function useRowMenu(listRef: RefObject<HTMLElement | null>) {
  const [request, setRequest] = useState<MenuRequest | null>(null);
  const element = (
    <DropdownMenu open={request !== null} onOpenChange={(open) => !open && setRequest(null)}>
      <DropdownMenuContent anchor={request?.anchor} side="bottom" align="start" finalFocus={listRef}>
        <DropdownMenuItem onClick={() => request?.play()}>Play</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  /** Opens the menu at the active row of a list key event. */
  const fromKey = (event: React.KeyboardEvent<HTMLElement>, play: (() => void) | null) => {
    if (!isMenuKey(event)) return false;
    event.preventDefault();
    const anchor = event.currentTarget.querySelector<HTMLElement>("[data-active]");
    if (anchor && play) setRequest({ anchor, play });
    return true;
  };
  const open = (anchor: HTMLElement, play: () => void) => setRequest({ anchor, play });
  return { element, fromKey, open };
}

/** Artist list with an "All" row first (R28). Rows load for the visible window (D14). */
export function ArtistList() {
  const search = useLibraryStore((state) => state.search);
  const selected = useLibraryStore((state) => state.selection.artist);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const ids = useCommand(() => commands.libraryArtists(search), NO_IDS, [search, version]);
  const { row, request } = useRowCache(commands.libraryArtistRows);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const onRange = useCallback(
    (start: number, end: number) => request(ids.slice(Math.max(0, start - 1), end)),
    [ids, request],
  );
  const idAt = (index: number) => (index === 0 ? null : (ids[index - 1] ?? null));
  const select = (id: number | null) => setSelection({ artist: id, album: null, song: null });
  const play = (id: number | null) => (id === null ? null : () => playScope({ artist: id, album: null }, search));
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Artists"
        role="listbox"
        count={ids.length + 1}
        rowHeight={ROW_HEIGHT}
        onRange={onRange}
        activeIndex={selected === null ? 0 : ids.indexOf(selected) + 1}
        onMove={(index) => select(idAt(index))}
        onKeyDown={(event) => menu.fromKey(event, play(selected))}
        renderRow={(index, frame) => {
          const id = idAt(index);
          const playRow = play(id);
          return (
            <Row
              key={id ?? "all"}
              frame={frame}
              selected={selected === id}
              onSelect={() => select(id)}
              onMenu={playRow ? (anchor) => menu.open(anchor, playRow) : undefined}
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
  const search = useLibraryStore((state) => state.search);
  const artist = useLibraryStore((state) => state.selection.artist);
  const selected = useLibraryStore((state) => state.selection.album);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const ids = useCommand(() => commands.libraryAlbums(artist, search), NO_IDS, [artist, search, version]);
  const { row, request } = useRowCache(commands.libraryAlbumRows);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const onRange = useCallback(
    (start: number, end: number) => request(ids.slice(Math.max(0, start - 1), end)),
    [ids, request],
  );
  const idAt = (index: number) => (index === 0 ? null : (ids[index - 1] ?? null));
  const select = (id: number | null) => setSelection({ album: id, song: null });
  // An album row plays the album from its first song (P6.5).
  const play = (id: number | null) => (id === null ? null : () => playScope({ artist: null, album: id }, search));
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Albums"
        role="listbox"
        count={ids.length + 1}
        rowHeight={ALBUM_ROW_HEIGHT}
        onRange={onRange}
        activeIndex={selected === null ? 0 : ids.indexOf(selected) + 1}
        onMove={(index) => select(idAt(index))}
        onKeyDown={(event) => {
          if (menu.fromKey(event, play(selected))) return;
          if (event.key === "Enter") {
            event.preventDefault();
            play(selected)?.();
          }
        }}
        renderRow={(index, frame) => {
          const id = idAt(index);
          const album = id === null ? undefined : row(id);
          const playRow = play(id);
          return (
            <Row
              key={id ?? "all"}
              frame={frame}
              selected={selected === id}
              onSelect={() => select(id)}
              onActivate={playRow ?? undefined}
              onMenu={playRow ? (anchor) => menu.open(anchor, playRow) : undefined}
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
  const { row, request } = useSongRows();
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const onRange = useCallback((start: number, end: number) => request(ids.slice(start, end + 1)), [ids, request]);
  const active = selected === null ? -1 : ids.indexOf(selected);
  // Playing a song sets the queue to the Songs list as shown (R6 queue rule).
  const play = (index: number) => () => playList(ids, index);
  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
      <VirtualList
        label="Songs"
        role="listbox"
        count={ids.length}
        rowHeight={ROW_HEIGHT}
        onRange={onRange}
        activeIndex={active >= 0 ? active : null}
        onMove={(index) => setSelection({ song: ids[index] ?? null })}
        onKeyDown={(event) => {
          if (menu.fromKey(event, active >= 0 ? play(active) : null)) return;
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
              onMenu={(anchor) => menu.open(anchor, play(index))}
            >
              <SongCells song={row(id)} showAlbum={showAlbum} playing={playing === id} />
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
  | { kind: "album"; id: number; artist: number; name: string; expanded: boolean; songs: number[] }
  | { kind: "song"; id: number; artist: number; album: number; songs: number[] }
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
        songs: album.songs,
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
          songs: album.songs,
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
  const search = useLibraryStore((state) => state.search);
  const selection = useLibraryStore((state) => state.selection);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const version = useLibraryStore((state) => state.version);
  const playing = usePlayingTrack();
  const tree = useCommand(() => commands.libraryTree(search), NO_TREE, [search, version]);
  const [openArtists, setOpenArtists] = useState(() => new Set<number>());
  const [openAlbums, setOpenAlbums] = useState(() => new Set<number>());
  const { row, request } = useSongRows();
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
  // In Tree mode a song plays its album as shown, from that song (R6 queue rule).
  const play = (line: TreeLine | undefined) => {
    if (line?.kind === "song") return () => playList(line.songs, line.songs.indexOf(line.id));
    if (line?.kind === "album") return () => playList(line.songs, 0);
    return null;
  };
  const active = lines.findIndex((line) =>
    selection.song !== null
      ? line.kind === "song" && line.id === selection.song && line.album === selection.album
      : selection.album !== null
        ? line.kind === "album" && line.id === selection.album
        : line.kind === "artist" && line.id === selection.artist,
  );
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
    if (menu.fromKey(event, play(line))) return;
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
        rowHeight={ROW_HEIGHT}
        onRange={onRange}
        activeIndex={active >= 0 ? active : null}
        onMove={(index) => select(lines[index])}
        place={(index) => ({ posinset: lines[index].posinset, setsize: lines[index].setsize })}
        onKeyDown={onKeyDown}
        renderRow={(index, frame) => {
          const line = lines[index];
          const playLine = play(line);
          const onMenu = playLine ? (anchor: HTMLElement) => menu.open(anchor, playLine) : undefined;
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
                <SongCells song={row(line.id)} showAlbum={false} playing={playing === line.id} />
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
