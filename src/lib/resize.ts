/**
 * Watches the size of `element` (UD24, PF-2). The callback runs at most once per animation
 * frame with the latest entry, so a burst of observations does the layout work once. The
 * returned function stops watching and cancels a pending frame.
 */
export function observeSize(element: Element, callback: (entry: ResizeObserverEntry) => void): () => void {
  let frame = 0;
  let latest: ResizeObserverEntry | undefined;
  const observer = new ResizeObserver((entries) => {
    latest = entries.at(-1) ?? latest;
    if (frame !== 0 || latest === undefined) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (latest) callback(latest);
    });
  });
  observer.observe(element);
  return () => {
    cancelAnimationFrame(frame);
    frame = 0;
    observer.disconnect();
  };
}
