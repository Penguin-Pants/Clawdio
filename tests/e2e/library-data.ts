// A small generated library for e2e tests (P3): 20 artists, 3 albums each, 10 songs each, and
// "Beyoncé" with one album for the accent search (P6-AC3). The handlers answer the library
// commands like the Rust index does: search folds case and accents (D4), and the Songs table
// sorts by up to two keys with ties in the R4 order (UD11). "?size=50000" adds generated
// artists until the library has that many songs (the U4 performance case, PF-3).
import type { AlbumRow } from "../../src/lib/ipc/bindings/AlbumRow";
import type { ArtistRow } from "../../src/lib/ipc/bindings/ArtistRow";
import type { PlaylistEntry } from "../../src/lib/ipc/bindings/PlaylistEntry";
import type { PlaylistRow } from "../../src/lib/ipc/bindings/PlaylistRow";
import type { SongRow } from "../../src/lib/ipc/bindings/SongRow";
import type { SongScope } from "../../src/lib/ipc/bindings/SongScope";
import type { SortKey } from "../../src/lib/ipc/bindings/SortKey";
import type { TreeArtist } from "../../src/lib/ipc/bindings/TreeArtist";

const artists: ArtistRow[] = [];
const albums: AlbumRow[] = [];
const songs: SongRow[] = [];
for (let a = 0; a < 20; a += 1) {
  const artist = { id: a, name: `Artist ${String(a).padStart(2, "0")}` };
  artists.push(artist);
  for (let b = 0; b < 3; b += 1) {
    const album: AlbumRow = {
      id: a * 3 + b,
      artistId: a,
      name: `Album ${String.fromCharCode(65 + b)}${a}`,
      artistName: artist.name,
    };
    albums.push(album);
    for (let s = 1; s <= 10; s += 1) {
      songs.push({
        id: songs.length,
        artistId: a,
        albumId: album.id,
        title: `Song ${s} of ${album.name}`,
        artistName: artist.name,
        albumName: album.name,
        tagArtist: s === 3 ? `${artist.name} feat. Guest` : null,
        durationMs: 120_000 + s * 1_000,
        trackNo: s,
        disc: null,
      });
    }
  }
}

{
  const artist = { id: artists.length, name: "Beyoncé" };
  artists.push(artist);
  const album: AlbumRow = {
    id: albums.length,
    artistId: artist.id,
    name: "Lemonade",
    artistName: artist.name,
  };
  albums.push(album);
  ["Pray You Catch Me", "Hold Up", "Sorry"].forEach((title, index) => {
    songs.push({
      id: songs.length,
      artistId: artist.id,
      albumId: album.id,
      title,
      artistName: artist.name,
      albumName: album.name,
      tagArtist: null,
      durationMs: 200_000,
      trackNo: index + 1,
      disc: null,
    });
  });
}

{
  const size = Number(new URLSearchParams(globalThis.location?.search ?? "").get("size") ?? 0);
  for (let a = 0; songs.length < size; a += 1) {
    const artist = { id: artists.length, name: `Bulk ${String(a).padStart(4, "0")}` };
    artists.push(artist);
    for (let b = 0; b < 5 && songs.length < size; b += 1) {
      const album: AlbumRow = {
        id: albums.length,
        artistId: artist.id,
        name: `Set ${b} of ${artist.name}`,
        artistName: artist.name,
      };
      albums.push(album);
      for (let s = 1; s <= 10 && songs.length < size; s += 1) {
        songs.push({
          id: songs.length,
          artistId: artist.id,
          albumId: album.id,
          title: `Track ${s} of ${album.name}`,
          artistName: artist.name,
          albumName: album.name,
          tagArtist: null,
          durationMs: 90_000 + ((songs.length * 7919) % 200_000),
          trackNo: s,
          disc: null,
        });
      }
    }
  }
}

/** Folding like the Rust `fold` (D4): accents removed, lowercase. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const hit = (query: string, ...texts: string[]) =>
  query === "" || texts.some((text) => fold(text).includes(fold(query)));
const songHits = (query: string, song: SongRow) => hit(query, song.title, song.albumName, song.artistName);

/** The value of one sort column, like the Rust index: folded text, numbers with none last. */
function sortValue(song: SongRow, column: SortKey["column"]): string | number {
  switch (column) {
    case "track":
      return song.trackNo ?? Number.MAX_SAFE_INTEGER;
    case "duration":
      return song.durationMs;
    case "title":
      return fold(song.title);
    case "artist":
      return fold(song.tagArtist ?? song.artistName);
    case "album":
      return fold(song.albumName);
  }
}

const collator = new Intl.Collator("en", { numeric: true });
/** The whole library sorted per sort keys: the mock stands in for the Rust index, so it keeps its work small. */
const sortedAll = new Map<string, SongRow[]>();

/** A stable sort by the keys (UD11); numbers in text compare by value ("2" before "10"). */
function sortSongs(list: SongRow[], sort: SortKey[]): SongRow[] {
  if (sort.length === 0) return list;
  const whole = list.length === songs.length;
  const cached = whole ? sortedAll.get(JSON.stringify(sort)) : undefined;
  if (cached) return cached;
  const sorted = [...list].sort((a, b) => {
    for (const key of sort) {
      const left = sortValue(a, key.column);
      const right = sortValue(b, key.column);
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : collator.compare(String(left), String(right));
      // No track number sorts last in both directions, like the Rust index.
      const missing = left === Number.MAX_SAFE_INTEGER || right === Number.MAX_SAFE_INTEGER;
      if (order !== 0) return key.descending && !missing ? -order : order;
    }
    return 0;
  });
  if (whole) sortedAll.set(JSON.stringify(sort), sorted);
  return sorted;
}

export const library = {
  // Every artist and album has songs, so an empty query skips the song scan (the 50,000-row case).
  artists: (query: string) =>
    artists.filter((artist) => query === "" || songs.some((s) => s.artistId === artist.id && songHits(query, s))),
  albums: (artist: number | null, query: string) =>
    albums.filter(
      (album) =>
        (artist === null || album.artistId === artist) &&
        (query === "" || songs.some((s) => s.albumId === album.id && songHits(query, s))),
    ),
  artistRows: (ids: number[]) => ids.map((id) => artists[id]),
  albumRows: (ids: number[]) => ids.map((id) => albums[id]),
  songIds: (scope: SongScope, query: string, sort: SortKey[] = []) =>
    sortSongs(
      songs.filter(
        (s) =>
          (scope.artist === null || s.artistId === scope.artist) &&
          (scope.album === null || s.albumId === scope.album) &&
          songHits(query, s),
      ),
      sort,
    ).map((s) => s.id),
  rows: (ids: number[]) => ids.map((id) => songs[id]),
  /** A rescan that keeps the id but changes the tags (R4): returns false for an unknown title. */
  retag: (title: string, change: Partial<SongRow>) => {
    const song = songs.find((candidate) => candidate.title === title);
    if (song) Object.assign(song, change);
    sortedAll.clear();
    return song !== undefined;
  },
  tree: (query: string): TreeArtist[] =>
    artists
      .map((artist) => ({
        id: artist.id,
        name: artist.name,
        albums: albums
          .filter((album) => album.artistId === artist.id)
          .map((album) => ({
            id: album.id,
            name: album.name,
            songs: songs.filter((s) => s.albumId === album.id && songHits(query, s)).map((s) => s.id),
          }))
          .filter((album) => album.songs.length > 0),
      }))
      .filter((artist) => artist.albums.length > 0),
  /** The art file of an album: "Lemonade" has none (P10-AC4). */
  art: (id: number): string | null => (albums[id]?.name === "Lemonade" ? null : "album.jpg"),
  queue: { entries: songs.slice(0, 50).map((s) => s.id), current: 3 },
  player: { status: "paused" as const, positionMs: 83_000, volume: 80, shuffle: false, repeat: "off" as const },
  playlists: Array.from({ length: 5 }, (_, p): [PlaylistRow, PlaylistEntry[]] => [
    { id: p, name: `Mix ${p + 1}`, fileName: `Mix ${p + 1}.m3u8`, entryCount: 6, isFavorites: false, missingCount: 1 },
    Array.from({ length: 6 }, (_, e) =>
      e === 5 ? { track: null, label: `../Missing/Song ${e}.mp3` } : { track: p * 10 + e, label: "" },
    ),
  ]),
  lyrics: { text: Array.from({ length: 60 }, (_, line) => `Lyric line ${line + 1}`).join("\n") },
};
