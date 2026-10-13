import { commands } from "@/lib/ipc/commands";
import { activateWidget, focusLibrarySearch, resetLayout } from "@/shell/layouts";

/** Reset layout shortcut (D17, R29). */
export const RESET_SHORTCUT_LABEL = "Ctrl+Shift+L";

/** The letter of a key event, so shortcuts follow the keyboard layout (AZERTY, Dvorak). */
function letter(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : "";
}

export function isResetShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && letter(event) === "l";
}

/** Ctrl+F: the Library search field (R25). */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && letter(event) === "f";
}

/** Keys inside open menus, dialogs and select popups belong to those controls (D17). */
function inMenuOrDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[role="menu"], [role="dialog"], [data-slot="select-content"]') !== null
  );
}

/** Input types that take no typed text: Space on them toggles playback (D17). */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"]);

/** Text fields keep Space for typing (R25, D17). */
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/**
 * Space toggles play and pause everywhere except in text fields and in open menus and dialogs
 * (D17, P7.11). On a focused button it does not press the button.
 */
export function isPlaybackSpace(event: KeyboardEvent): boolean {
  return (
    event.key === " " &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !inTextField(event.target) &&
    !inMenuOrDialog(event.target)
  );
}

/**
 * Visible widget bodies in reading order: top to bottom, then left to right (P2.12). A widget
 * in a hidden tab has no layout box, so it is skipped.
 */
export function widgetRegions(root: ParentNode = document): HTMLElement[] {
  return (
    [...root.querySelectorAll<HTMLElement>("[data-widget]")]
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      // A widget in an inert container (the dock while the mini player shows, UD19) is skipped.
      .filter(({ element, rect }) => rect.width > 0 && rect.height > 0 && !element.closest("[inert]"))
      .sort((a, b) => Math.round(a.rect.top) - Math.round(b.rect.top) || a.rect.left - b.rect.left)
      .map(({ element }) => element)
  );
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
  if (isSearchShortcut(event) && !inMenuOrDialog(event.target)) {
    return focusLibrarySearch(doc);
  }
  if (event.key === "F6" && !event.ctrlKey && !event.altKey && !event.metaKey && !inMenuOrDialog(event.target)) {
    const region = nextRegion(widgetRegions(doc), doc.activeElement, event.shiftKey);
    // The widget becomes the active dock panel, so the Layout menu acts on it (UD17). Dockview
    // can move focus while it activates a panel, so the region takes focus after it.
    if (region?.dataset.widget) activateWidget(region.dataset.widget);
    region?.focus();
    return true;
  }
  return false;
}

/**
 * Space before any other handler (capture phase): it toggles playback and no focused control
 * sees it, so a button is not pressed on key up (D17). Returns true when it handled the event.
 */
export function handleSpace(event: KeyboardEvent, toggle: () => void = playbackToggle): boolean {
  if (!isPlaybackSpace(event)) return false;
  event.preventDefault();
  event.stopPropagation();
  if (event.type === "keydown" && !event.repeat) toggle();
  return true;
}

function playbackToggle() {
  void commands.playerToggle().catch(() => {});
}

/** Installs the global key handlers on the window. Returns the uninstall function. */
export function installKeyboard(target: Window = window): () => void {
  const listener = (event: KeyboardEvent) => {
    if (handleGlobalKey(event, target.document)) event.preventDefault();
  };
  const space = (event: KeyboardEvent) => void handleSpace(event);
  target.addEventListener("keydown", space, true);
  target.addEventListener("keyup", space, true);
  target.addEventListener("keydown", listener);
  return () => {
    target.removeEventListener("keydown", space, true);
    target.removeEventListener("keyup", space, true);
    target.removeEventListener("keydown", listener);
  };
}
