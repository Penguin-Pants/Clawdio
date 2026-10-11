/** A widget body with data, by the elements it shows when populated (P3.1). */
const POPULATED = [
  '[data-widget="library"] [role="option"]:not(:first-child), [data-widget="library"] [role="treeitem"]',
  '[data-widget="queue"] [role="option"]',
  '[data-widget="playlists"] [role="treeitem"]',
  '[data-widget="lyrics"] section',
  '[data-widget="nowPlaying"] p.text-lg',
];

/** The Now playing art: a thumbnail that loaded through the `thumb://` scheme (P3-AC5). */
function artLoaded(root: ParentNode): boolean {
  const art = root.querySelector<HTMLImageElement>('[data-widget="nowPlaying"] img');
  return art !== null && art.complete && art.naturalWidth > 0;
}

/** True when all six widgets are in the page, show data and the Now playing art loaded. */
export function measurementPopulated(root: ParentNode = document): boolean {
  return (
    root.querySelector('[data-widget="transport"]') !== null &&
    POPULATED.every((selector) => root.querySelector(selector)) &&
    artLoaded(root)
  );
}

/**
 * Resolves once every widget shows data, so the measurement samples the populated UI
 * (P3.5). Rejects after `timeoutMs`.
 */
export function waitForPopulated(timeoutMs = 60_000, root: ParentNode = document): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (measurementPopulated(root)) resolve();
      else if (Date.now() - start > timeoutMs) reject(new Error("measurement: widgets did not fill"));
      else setTimeout(check, 250);
    };
    check();
  });
}
