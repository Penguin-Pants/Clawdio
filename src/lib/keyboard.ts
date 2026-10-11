import { resetLayout } from "@/shell/layouts";

/** Reset layout shortcut (D17, R29). */
export const RESET_SHORTCUT_LABEL = "Ctrl+Shift+L";

export function isResetShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyL";
}

/** Keys inside open menus and dialogs belong to those controls (D17). */
function inMenuOrDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="menu"], [role="dialog"], [role="listbox"]') !== null;
}

/**
 * Visible widget bodies in reading order: top to bottom, then left to right (P2.12). A widget
 * in a hidden tab has no layout box, so it is skipped.
 */
export function widgetRegions(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-widget]")]
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => Math.round(a.rect.top) - Math.round(b.rect.top) || a.rect.left - b.rect.left)
    .map(({ element }) => element);
}

/** The region F6 (or Shift+F6 when `backward`) moves to. It wraps at both ends. */
export function nextRegion(regions: HTMLElement[], active: Element | null, backward: boolean): HTMLElement | undefined {
  if (regions.length === 0) return undefined;
  const current = regions.findIndex((region) => active !== null && region.contains(active));
  if (current === -1) return backward ? regions[regions.length - 1] : regions[0];
  const step = backward ? -1 : 1;
  return regions[(current + step + regions.length) % regions.length];
}

/** The one global key handler (section 6.16). Returns true when it handled the event. */
export function handleGlobalKey(event: KeyboardEvent, doc: Document = document): boolean {
  if (isResetShortcut(event)) {
    resetLayout();
    return true;
  }
  if (event.key === "F6" && !event.ctrlKey && !event.altKey && !event.metaKey && !inMenuOrDialog(event.target)) {
    nextRegion(widgetRegions(doc), doc.activeElement, event.shiftKey)?.focus();
    return true;
  }
  return false;
}

/** Installs the global key handler on the window. Returns the uninstall function. */
export function installKeyboard(target: Window = window): () => void {
  const listener = (event: KeyboardEvent) => {
    if (handleGlobalKey(event, target.document)) event.preventDefault();
  };
  target.addEventListener("keydown", listener);
  return () => target.removeEventListener("keydown", listener);
}
