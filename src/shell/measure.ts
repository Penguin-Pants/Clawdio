/** A widget body with data, by the elements it shows when populated (P3.1). */
const POPULATED = [
  '[data-widget="library"] [role="option"]:not(:first-child), [data-widget="library"] [role="treeitem"]',
  '[data-widget="queue"] [role="option"]',
  '[data-widget="playlists"] [role="treeitem"]',
  '[data-widget="lyrics"] section',
  '[data-widget="nowPlaying"] p.text-lg',
];

/** True when all six widgets are in the page and show data. */
export function measurementPopulated(root: ParentNode = document): boolean {
  return (
    root.querySelector('[data-widget="transport"]') !== null &&
    POPULATED.every((selector) => root.querySelector(selector))
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
