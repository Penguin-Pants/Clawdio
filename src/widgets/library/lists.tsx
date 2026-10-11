import { useCallback, useMemo, useState } from "react";
import { VirtualList } from "@/components/virtual-list";
import { commands, type TreeArtist } from "@/lib/ipc/commands";
import { useCommand, useRowCache, useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { ALBUM_ROW_HEIGHT, AlbumCells, ROW_HEIGHT, Row, SongCells } from "./rows";

const NO_IDS: number[] = [];
const NO_TREE: TreeArtist[] = [];

/** Artist list with an "All" row first (R28). Rows load for the visible window (D14). */
export function ArtistList() {
  const search = useLibraryStore((state) => state.search);
  const selected = useLibraryStore((state) => state.selection.artist);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const ids = useCommand(() => commands.libraryArtists(search), NO_IDS, [search]);
  const { row, request } = useRowCache(commands.libraryArtistRows);
  const onRange = useCallback(
    (start: number, end: number) => request(ids.slice(Math.max(0, start - 1), end)),
    [ids, request],
  );
  return (
    <VirtualList
      label="Artists"
      role="listbox"
      count={ids.length + 1}
      rowHeight={ROW_HEIGHT}
      onRange={onRange}
      renderRow={(index, style) => {
        const id = index === 0 ? null : ids[index - 1];
        return (
          <Row
            key={id ?? "all"}
            style={style}
            selected={selected === id}
            onSelect={() => setSelection({ artist: id, album: null, song: null })}
          >
            <span className="truncate">{id === null ? "All" : (row(id)?.name ?? "…")}</span>
          </Row>
        );
      }}
    />
  );
}

/** Album list of the selected artist with an "All" row first. Rows show the thumbnail (R5) and load for the visible window (D14). */
export function AlbumList() {
  const search = useLibraryStore((state) => state.search);
  const artist = useLibraryStore((state) => state.selection.artist);
  const selected = useLibraryStore((state) => state.selection.album);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const ids = useCommand(() => commands.libraryAlbums(artist, search), NO_IDS, [artist, search]);
  const { row, request } = useRowCache(commands.libraryAlbumRows);
  const onRange = useCallback(
    (start: number, end: number) => request(ids.slice(Math.max(0, start - 1), end)),
    [ids, request],
  );
  return (
    <VirtualList
      label="Albums"
      role="listbox"
      count={ids.length + 1}
      rowHeight={ALBUM_ROW_HEIGHT}
      onRange={onRange}
      renderRow={(index, style) => {
        const id = index === 0 ? null : ids[index - 1];
        const album = id === null ? undefined : row(id);
        return (
          <Row
            key={id ?? "all"}
            style={style}
            selected={selected === id}
            onSelect={() => setSelection({ album: id, song: null })}
          >
            {id === null ? <span className="pl-12">All</span> : album ? <AlbumCells album={album} /> : <span>…</span>}
          </Row>
        );
      }}
    />
  );
}

/** Songs of the selected artist and album, or all songs (R28). Rows load for the visible window. */
export function SongList({ showAlbum }: { showAlbum: boolean }) {
  const search = useLibraryStore((state) => state.search);
  const artist = useLibraryStore((state) => state.selection.artist);
  const album = useLibraryStore((state) => state.selection.album);
  const selected = useLibraryStore((state) => state.selection.song);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const ids = useCommand(() => commands.librarySongIds({ artist, album }, search), NO_IDS, [artist, album, search]);
  const { row, request } = useSongRows();
  const onRange = useCallback((start: number, end: number) => request(ids.slice(start, end + 1)), [ids, request]);
  return (
    <VirtualList
      label="Songs"
      role="listbox"
      count={ids.length}
      rowHeight={ROW_HEIGHT}
      onRange={onRange}
      renderRow={(index, style) => {
        const id = ids[index];
        return (
          <Row key={id} style={style} selected={selected === id} onSelect={() => setSelection({ song: id })}>
            <SongCells song={row(id)} showAlbum={showAlbum} />
          </Row>
        );
      }}
    />
  );
}

type TreeLine =
  | { kind: "artist"; id: number; name: string; expanded: boolean }
  | { kind: "album"; id: number; artist: number; name: string; expanded: boolean }
  | { kind: "song"; id: number; artist: number; album: number };

/** One expandable artist, album and song tree (R28). Song rows load for the visible window. */
export function TreeList() {
  const search = useLibraryStore((state) => state.search);
  const selection = useLibraryStore((state) => state.selection);
  const setSelection = useLibraryStore((state) => state.setSelection);
  const tree = useCommand(() => commands.libraryTree(search), NO_TREE, [search]);
  const [openArtists, setOpenArtists] = useState(() => new Set<number>());
  const [openAlbums, setOpenAlbums] = useState(() => new Set<number>());
  const { row, request } = useSongRows();
  const lines = useMemo(() => {
    const result: TreeLine[] = [];
    for (const artist of tree) {
      const artistOpen = openArtists.has(artist.id);
      result.push({ kind: "artist", id: artist.id, name: artist.name, expanded: artistOpen });
      if (!artistOpen) continue;
      for (const album of artist.albums) {
        const albumOpen = openAlbums.has(album.id);
        result.push({ kind: "album", id: album.id, artist: artist.id, name: album.name, expanded: albumOpen });
        if (albumOpen)
          album.songs.forEach((id) => result.push({ kind: "song", id, artist: artist.id, album: album.id }));
      }
    }
    return result;
  }, [tree, openArtists, openAlbums]);
  const toggle = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
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
  return (
    <VirtualList
      label="Library"
      role="tree"
      count={lines.length}
      rowHeight={ROW_HEIGHT}
      onRange={onRange}
      renderRow={(index, style) => {
        const line = lines[index];
        if (line.kind === "song") {
          return (
            <Row
              key={`s${line.id}`}
              role="treeitem"
              level={3}
              style={style}
              className="pl-12"
              selected={selection.song === line.id}
              onSelect={() => setSelection({ artist: line.artist, album: line.album, song: line.id })}
            >
              <SongCells song={row(line.id)} showAlbum={false} />
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
            style={style}
            className={isArtist ? undefined : "pl-6"}
            selected={isArtist ? selection.artist === line.id && selection.album === null : selection.album === line.id}
            onSelect={() => {
              if (isArtist) {
                setOpenArtists((open) => toggle(open, line.id));
                setSelection({ artist: line.id, album: null, song: null });
              } else if (line.kind === "album") {
                setOpenAlbums((open) => toggle(open, line.id));
                setSelection({ artist: line.artist, album: line.id, song: null });
              }
            }}
          >
            <span className="truncate">{line.name}</span>
          </Row>
        );
      }}
    />
  );
}
