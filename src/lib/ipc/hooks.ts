import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type SongRow } from "./commands";

/**
 * Runs a command when its inputs change and returns the last result. A failed call (for
 * example outside the app shell) gives `fallback`.
 */
export function useCommand<T>(load: () => Promise<T>, fallback: T, deps: readonly unknown[]): T {
  return useCommandResult(load, fallback, deps).value;
}

/** Two input lists hold the same values in the same order. */
function sameInputs(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  return a !== null && a.length === b.length && a.every((input, index) => Object.is(input, b[index]));
}

/**
 * `useCommand` with `current`: true when the value was loaded for the inputs of this render.
 * While new inputs load, the old value stays and `current` is false (D65 type-to-find).
 */
export function useCommandResult<T>(
  load: () => Promise<T>,
  fallback: T,
  deps: readonly unknown[],
): { value: T; current: boolean } {
  const [state, setState] = useState<{ value: T; inputs: readonly unknown[] | null }>({
    value: fallback,
    inputs: null,
  });
  const fallbackRef = useRef(fallback);
  useEffect(() => {
    let active = true;
    const inputs = deps;
    load().then(
      (result) => {
        if (active) setState({ value: result, inputs });
      },
      () => {
        if (active) setState({ value: fallbackRef.current, inputs });
      },
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists the inputs of `load`.
  }, deps);
  return { value: state.value, current: sameInputs(state.inputs, deps) };
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
 * ROW_CACHE_LIMIT rows. A new `libraryVersion` empties it: a rescan keeps ids but can change
 * their rows (D46).
 */
export function useRowCache<T extends { id: number }>(
  fetchRows: (ids: number[]) => Promise<T[]>,
  libraryVersion: number,
): RowCache<T> {
  // New maps for each library version: the old rows are dropped and the lists ask again.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the version is the reason to start over.
  const store = useMemo(() => ({ cache: new Map<number, T>(), pending: new Set<number>() }), [libraryVersion]);
  const fetchRef = useRef(fetchRows);
  const [, setVersion] = useState(0);
  const request = useCallback(
    (ids: number[]) => {
      const { cache, pending } = store;
      const missing = ids.filter((id) => !cache.has(id) && !pending.has(id));
      if (missing.length === 0) return;
      missing.forEach((id) => pending.add(id));
      fetchRef.current(missing).then(
        (rows) => {
          rows.forEach((row) => cache.set(row.id, row));
          for (const id of cache.keys()) {
            if (cache.size <= ROW_CACHE_LIMIT) break;
            cache.delete(id);
          }
          missing.forEach((id) => pending.delete(id));
          setVersion((version) => version + 1);
        },
        () => missing.forEach((id) => pending.delete(id)),
      );
    },
    [store],
  );
  const row = useCallback((id: number) => store.cache.get(id), [store]);
  return { row, request };
}

/** Song rows for the visible window (D14). */
export function useSongRows(libraryVersion: number): RowCache<SongRow> {
  return useRowCache(commands.libraryRows, libraryVersion);
}
