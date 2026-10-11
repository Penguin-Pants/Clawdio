import { useCallback, useEffect, useRef, useState } from "react";
import { commands, type SongRow } from "./commands";

/**
 * Runs a command when its inputs change and returns the last result. A failed call (for
 * example outside the app shell) gives `fallback`.
 */
export function useCommand<T>(load: () => Promise<T>, fallback: T, deps: readonly unknown[]): T {
  const [value, setValue] = useState<T>(fallback);
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    let active = true;
    load().then(
      (result) => {
        if (active) setValue(result);
      },
      () => {
        if (active) setValue(fallbackRef.current);
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists the inputs of `load`.
  }, deps);
  return value;
}

/** Most rows a list keeps. Older rows are dropped first and load again when needed. */
export const ROW_CACHE_LIMIT = 2_000;

/** A row cache: `row` reads it, `request` loads the ids that are not cached yet. */
export interface RowCache<T> {
  row: (id: number) => T | undefined;
  request: (ids: number[]) => void;
}

/**
 * Rows by id, fetched for the visible window only (D14). The cache keeps at most
 * ROW_CACHE_LIMIT rows.
 */
export function useRowCache<T extends { id: number }>(fetchRows: (ids: number[]) => Promise<T[]>): RowCache<T> {
  const cache = useRef(new Map<number, T>());
  const pending = useRef(new Set<number>());
  const fetchRef = useRef(fetchRows);
  const [, setVersion] = useState(0);
  const request = useCallback((ids: number[]) => {
    const missing = ids.filter((id) => !cache.current.has(id) && !pending.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => pending.current.add(id));
    fetchRef.current(missing).then(
      (rows) => {
        rows.forEach((row) => cache.current.set(row.id, row));
        for (const id of cache.current.keys()) {
          if (cache.current.size <= ROW_CACHE_LIMIT) break;
          cache.current.delete(id);
        }
        missing.forEach((id) => pending.current.delete(id));
        setVersion((version) => version + 1);
      },
      () => missing.forEach((id) => pending.current.delete(id)),
    );
  }, []);
  const row = useCallback((id: number) => cache.current.get(id), []);
  return { row, request };
}

/** Song rows for the visible window (D14). */
export function useSongRows(): RowCache<SongRow> {
  return useRowCache(commands.libraryRows);
}
