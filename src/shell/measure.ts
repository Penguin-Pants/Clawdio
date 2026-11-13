/** The widgets that every measurement arrangement mounts (P3.1, `applyMeasureLayout`). */
const WIDGETS = ["transport", "songs", "nowPlaying", "playlists", "queue", "lyrics"];

/** A song row of the Songs table, or a Tree item: the library has loaded (the "All" rows do not count). */
const LIBRARY_ROWS = '[data-widget="songs"] [role="row"][aria-selected], [data-widget="tree"] [role="treeitem"]';

/**
 * True when the measured widgets are in the page and the Songs table shows the library. With the
 * production setup (P6.7) only the Library has data: the queue, playlists and lyrics fill in
 * later phases, and D28 measures with no playback.
 */
export function measurementPopulated(root: ParentNode = document): boolean {
  return (
    WIDGETS.every((id) => root.querySelector(`[data-widget="${id}"]`) !== null) &&
    root.querySelector(LIBRARY_ROWS) !== null
  );
}

/**
 * Resolves once the widgets show the library and `scanDone` says the startup scan ended, so
 * the idle period starts after the library loads (D28). Rejects after `timeoutMs`.
 */
export function waitForPopulated(
  scanDone: () => Promise<boolean>,
  timeoutMs = 600_000,
  root: ParentNode = document,
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      if (measurementPopulated(root) && (await scanDone().catch(() => false))) resolve();
      else if (Date.now() - start > timeoutMs) reject(new Error("measurement: the library did not load"));
      else setTimeout(check, 250);
    };
    void check();
  });
}
