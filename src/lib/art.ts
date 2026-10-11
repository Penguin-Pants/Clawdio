import { useEffect, useState } from "react";
import { commands } from "@/lib/ipc/commands";

/** Art sizes (D27): album rows and display art (Now playing). */
export type ArtSize = 96 | 512;

/** Art file names already known, by album and size. A pending or missing art is not kept. */
const known = new Map<string, string>();
/** Albums whose art file just appeared, for the rows that show them. */
const listeners = new Set<(album: number) => void>();

const keyOf = (album: number, size: ArtSize) => `${album}-${size}`;

/** The `art-ready` event (P10.2): the album's rows ask again. */
export function artReady(album: number): void {
  known.delete(keyOf(album, 96));
  known.delete(keyOf(album, 512));
  listeners.forEach((listener) => listener(album));
}

/** A library change can change art sources: names are asked again on the next mount. */
export function forgetArt(): void {
  known.clear();
}

/**
 * The art file name of an album, or null while it is made or when there is none. Only rows
 * that are rendered call this, so art loads for the visible window only (P10.3, D14).
 */
export function useAlbumArt(album: number | null, size: ArtSize): string | null {
  const [state, setState] = useState<{ key: string | null; name: string | null }>({ key: null, name: null });
  const [ready, setReady] = useState(0);
  const key = album === null ? null : keyOf(album, size);
  useEffect(() => {
    if (album === null) return;
    const listener = (changed: number) => {
      if (changed === album) setReady((count) => count + 1);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [album]);
  useEffect(() => {
    if (album === null || key === null || known.has(key)) return;
    let active = true;
    commands.albumArt(album, size).then(
      (name) => {
        if (name !== null) known.set(key, name);
        if (active) setState({ key, name });
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [album, size, key, ready]);
  if (key === null) return null;
  return known.get(key) ?? (state.key === key ? state.name : null);
}
