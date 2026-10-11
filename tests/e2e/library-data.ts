// A small generated library for e2e tests (P3): 20 artists, 3 albums each, 10 songs each, and
// "Beyoncé" with one album for the accent search (P6-AC3). The handlers answer the library
// commands like the Rust index does: search folds case and accents (D4).
import type { AlbumRow } from "../../src/lib/ipc/bindings/AlbumRow";
import type { ArtistRow } from "../../src/lib/ipc/bindings/ArtistRow";
import type { PlaylistEntry } from "../../src/lib/ipc/bindings/PlaylistEntry";
import type { PlaylistRow } from "../../src/lib/ipc/bindings/PlaylistRow";
import type { SongRow } from "../../src/lib/ipc/bindings/SongRow";
import type { SongScope } from "../../src/lib/ipc/bindings/SongScope";
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
  for (const title of ["Pray You Catch Me", "Hold Up", "Sorry"]) {
    songs.push({
      id: songs.length,
      artistId: artist.id,
      albumId: album.id,
      title,
      artistName: artist.name,
      albumName: album.name,
      tagArtist: null,
      durationMs: 200_000,
    });
  }
}

/** Folding like the Rust `fold` (D4): accents removed, lowercase. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const hit = (query: string, ...texts: string[]) =>
  query === "" || texts.some((text) => fold(text).includes(fold(query)));
const songHits = (query: string, song: SongRow) => hit(query, song.title, song.albumName, song.artistName);

export const library = {
  artists: (query: string) =>
    artists.filter((artist) => songs.some((s) => s.artistId === artist.id && songHits(query, s))),
  albums: (artist: number | null, query: string) =>
    albums.filter(
      (album) =>
        (artist === null || album.artistId === artist) &&
        songs.some((s) => s.albumId === album.id && songHits(query, s)),
    ),
  artistRows: (ids: number[]) => ids.map((id) => artists[id]),
  albumRows: (ids: number[]) => ids.map((id) => albums[id]),
  songIds: (scope: SongScope, query: string) =>
    songs
      .filter(
        (s) =>
          (scope.artist === null || s.artistId === scope.artist) &&
          (scope.album === null || s.albumId === scope.album) &&
          songHits(query, s),
      )
      .map((s) => s.id),
  rows: (ids: number[]) => ids.map((id) => songs[id]),
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
    { id: p, name: `Mix ${p + 1}`, entryCount: 6 },
    Array.from({ length: 6 }, (_, e) =>
      e === 5 ? { track: null, label: `../Missing/Song ${e}.mp3` } : { track: p * 10 + e, label: "" },
    ),
  ]),
  lyrics: { text: Array.from({ length: 60 }, (_, line) => `Lyric line ${line + 1}`).join("\n") },
};
