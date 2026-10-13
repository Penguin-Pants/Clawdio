import { useSyncExternalStore } from "react";
import { observeSize } from "./resize";

/** The size tokens (UD1, `theme/tokens.json` `sizes`), as CSS variables in rem. */
export type SizeToken =
  | "--size-transport-bar"
  | "--size-transport-bar-compact"
  | "--size-row-regular"
  | "--size-row-compact"
  | "--size-row-album";

/** The default root font size, used when the computed one is not a number. */
const DEFAULT_ROOT_PX = 16;

/**
 * The computed px value of a size token: its rem value times the root font size. Text scaling
 * (Windows display scale, the P17.5 scales) changes the root font size and so the result.
 */
export function tokenPx(name: SizeToken, root: HTMLElement = document.documentElement): number {
  const style = getComputedStyle(root);
  const raw = style.getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  if (raw.endsWith("rem")) return value * (Number.parseFloat(style.fontSize) || DEFAULT_ROOT_PX);
  return value;
}

const listeners = new Set<() => void>();
let stopProbe: (() => void) | undefined;
/**
 * The token values of the current root font size. React reads a snapshot on every render and
 * commit, and a computed-style read after a DOM change forces a style pass over the whole page
 * (PF-3), so the hook reads the style once per root font size.
 */
const cache = new Map<SizeToken, number>();

function cachedPx(name: SizeToken): number {
  let value = cache.get(name);
  if (value === undefined) {
    value = tokenPx(name);
    cache.set(name, value);
  }
  return value;
}

/** One 1 rem probe for every reader: its size changes when the root font size does (UD24). */
function startProbe(): void {
  const probe = document.createElement("div");
  probe.dataset.tokenProbe = "";
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;top:0;left:0;width:1rem;height:0;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const stop = observeSize(probe, () => {
    cache.clear();
    for (const listener of listeners) listener();
  });
  stopProbe = () => {
    stop();
    probe.remove();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    // The root font size can change while nothing watches it.
    cache.clear();
    startProbe();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopProbe?.();
      stopProbe = undefined;
    }
  };
}

/** The px value of a size token, read again when the root font size changes (UD1). */
export function useTokenPx(name: SizeToken): number {
  return useSyncExternalStore(subscribe, () => cachedPx(name));
}
