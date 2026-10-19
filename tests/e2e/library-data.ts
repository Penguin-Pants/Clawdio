// A small generated library for e2e tests (P3): 20 artists, 3 albums each, 10 songs each, and
// "Beyoncé" with one album for the accent search (P6-AC3). The handlers answer the library
// commands like the Rust index does: search folds case and accents (D4), and the Songs table
// sorts by up to two keys with ties in the R4 order (UD11). "?size=50000" adds generated
// artists until the library has that many songs (the U4 performance case, PF-3).
import { formatDuration } from "../../src/lib/format";
import type { AlbumRow } from "../../src/lib/ipc/bindings/AlbumRow";
import type { ArtistRow } from "../../src/lib/ipc/bindings/ArtistRow";
import type { FindHit } from "../../src/lib/ipc/bindings/FindHit";
import type { FindList } from "../../src/lib/ipc/bindings/FindList";
import type { PlaylistEntry } from "../../src/lib/ipc/bindings/PlaylistEntry";
import type { PlaylistRow } from "../../src/lib/ipc/bindings/PlaylistRow";
import type { SongRow } from "../../src/lib/ipc/bindings/SongRow";
import type { SongScope } from "../../src/lib/ipc/bindings/SongScope";
import type { SortKey } from "../../src/lib/ipc/bindings/SortKey";
import type { TreeRow } from "../../src/lib/ipc/bindings/TreeRow";
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

/**
 * "?find=1" adds the type-to-find artists (P25-AC4): their albums and songs start with Z or
 * "ZZ Top" only here, so each list has one first Z row and one "ZZ Top" row, far down.
 */
const FIND = new URLSearchParams(globalThis.location?.search ?? "").get("find") === "1";
const findSongs: number[] = [];
if (FIND) {
  // Twenty "Delta" artists put the Z artists out of view below "Chemical Brothers".
  const deltas = Array.from({ length: 20 }, (_, d): [string, string, string[]] => {
    const name = `Delta ${String(d + 1).padStart(2, "0")}`;
    return [name, `${name} Album`, [`${name} Song`]];
  });
  const groups: [string, string, string[]][] = [
    ["Chemical Brothers", "Dig Your Own Hole", ["Setting Sun", "Block Rockin' Beats"]],
    ...deltas,
    ["Zapp", "Zapp II", ["Zoom", "Dance Floor"]],
    ["ZZ Top", "ZZ Top's First Album", ["ZZ Top Boogie", "Brown Sugar"]],
  ];
  for (const [name, albumName, titles] of groups) {
    const artist = { id: artists.length, name };
    artists.push(artist);
    const album: AlbumRow = { id: albums.length, artistId: artist.id, name: albumName, artistName: name };
    albums.push(album);
    titles.forEach((title, index) => {
      if (!name.startsWith("Delta")) findSongs.push(songs.length);
      songs.push({
        id: songs.length,
        artistId: artist.id,
        albumId: album.id,
        title,
        artistName: name,
        albumName,
        tagArtist: null,
        durationMs: 180_000,
        trackNo: index + 1,
        disc: null,
      });
    });
  }
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

/** The name type-to-find matches in the Songs table: the first sort column as shown, else Title (R36.5). */
function songName(song: SongRow, column: SortKey["column"] | undefined): string {
  switch (column) {
    case "track":
      return song.trackNo === null ? "" : String(song.trackNo);
    case "duration":
      return formatDuration(song.durationMs);
    case "artist":
      return song.tagArtist ?? song.artistName;
    case "album":
      return song.albumName;
    default:
      return song.title;
  }
}

/** The first name from the top that starts with `text`, folded (R36.4), as the Rust `find`. */
function firstHit(rows: { id: number; name: string }[], text: string): FindHit | null {
  const prefix = fold(text);
  const index = prefix === "" ? -1 : rows.findIndex((row) => fold(row.name).startsWith(prefix));
  return index < 0 ? null : { index, id: rows[index].id };
}
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

function findPlaylists(): [PlaylistRow, PlaylistEntry[]][] {
  const row = (id: number, name: string, entries: PlaylistEntry[]): [PlaylistRow, PlaylistEntry[]] => [
    { id, name, fileName: `${name}.m3u8`, entryCount: entries.length, isFavorites: false, missingCount: 0 },
    entries,
  ];
  const long: PlaylistEntry[] = [
    { track: null, label: "../Missing/Zzz.mp3" },
    ...Array.from({ length: 40 }, (_, track) => ({ track, label: "" })),
    ...findSongs.map((track) => ({ track, label: "" })),
  ];
  return [
    row(5, "Find mix", long),
    row(6, "Zapp jams", [{ track: findSongs[2], label: "" }]),
    row(7, "ZZ Top hits", [{ track: findSongs[4], label: "" }]),
  ];
}

/** The label of a shown tree row (R36.5): the artist, album or song name. */
function treeName(row: TreeRow): string {
  switch (row.kind) {
    case "artist":
      return artists[row.id]?.name ?? "";
    case "album":
      return albums[row.id]?.name ?? "";
    default:
      return songs[row.id]?.title ?? "";
  }
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
  /**
   * Type-to-find (D65). The playlist view and the queue pass their entries' tracks (null for a
   * missing entry); the other lists are read again from their identity, as in Rust.
   */
  find: (list: FindList, text: string, tracks: (number | null)[] = []): FindHit | null => {
    switch (list.kind) {
      case "artists":
        return firstHit(library.artists(list.query), text);
      case "albums":
        return firstHit(library.albums(list.artist, list.query), text);
      case "songs":
        return firstHit(
          library
            .songIds(list.scope, list.query, list.sort)
            .map((id) => ({ id, name: songName(songs[id], list.sort[0]?.column) })),
          text,
        );
      case "tree":
        return firstHit(
          list.rows.map((row) => ({ id: row.id, name: treeName(row) })),
          text,
        );
      default:
        return firstHit(
          tracks.map((track) => ({ id: track ?? 0, name: track === null ? "" : (songs[track]?.title ?? "") })),
          text,
        );
    }
  },
  /** The art file of an album: "Lemonade" has none (P10-AC4). */
  art: (id: number): string | null => (albums[id]?.name === "Lemonade" ? null : "album.jpg"),
  // "?find=1" adds the type-to-find songs to the end of the queue (P25-AC4).
  queue: { entries: [...songs.slice(0, 50).map((s) => s.id), ...findSongs], current: 3 },
  player: {
    status: "paused" as const,
    positionMs: 83_000,
    volume: 80,
    shuffle: false,
    repeat: "off" as const,
    started: 0,
  },
  playlists: [
    ...Array.from({ length: 5 }, (_, p): [PlaylistRow, PlaylistEntry[]] => [
      {
        id: p,
        name: `Mix ${p + 1}`,
        fileName: `Mix ${p + 1}.m3u8`,
        entryCount: 6,
        isFavorites: false,
        missingCount: 1,
      },
      Array.from({ length: 6 }, (_, e) =>
        e === 5 ? { track: null, label: `../Missing/Song ${e}.mp3` } : { track: p * 10 + e, label: "" },
      ),
    ]),
    // "?find=1": a long playlist that ends with the type-to-find songs, a missing entry named
    // "Zzz" first, and two playlists whose names start with Z (P25-AC4).
    ...(FIND ? findPlaylists() : []),
  ],
  lyrics: { text: Array.from({ length: 60 }, (_, line) => `Lyric line ${line + 1}`).join("\n") },
};
