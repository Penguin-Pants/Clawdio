import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import type { PlaylistEntry } from "@/lib/ipc/commands";
import { menuDialogOrDrag } from "@/lib/type-find";
import { usePlayerStore } from "@/store/player";

/** No follow within this time of the user's last input in the list (R35.5, a starting value). */
export const FOLLOW_IDLE_MS = 5000;

/**
 * The follow rule for one song change (R35): the list has a selected row as shown (R35.2), the
 * song is in the list as shown (R35.6), and the list is not busy (R35.5).
 */
export function shouldFollow(check: {
  hasSelection: boolean;
  target: number | null;
  busy: boolean;
  lastInput: number | null;
  now: number;
}): boolean {
  const idle = check.lastInput === null || check.now - check.lastInput >= FOLLOW_IDLE_MS;
  return check.hasSelection && check.target !== null && !check.busy && idle;
}

/**
 * The playlist view row of the playing song (D63). When the queue came from this view, queue
 * entry `current` maps to the row through the entries that are not missing (`playlistQueue`
 * skips them). Otherwise only a track that is in the playlist once has a row.
 */
export function playlistFollowRow(
  entries: readonly PlaylistEntry[],
  playing: { track: number; current: number },
  fromThisView: boolean,
): number | null {
  if (fromThisView) {
    let seen = -1;
    const row = entries.findIndex((entry) => entry.track !== null && ++seen === playing.current);
    return row >= 0 && entries[row].track === playing.track ? row : null;
  }
  const rows = entries.flatMap((entry, index) => (entry.track === playing.track ? [index] : []));
  return rows.length === 1 ? rows[0] : null;
}

/** What a list tells the follow rule at a song change. */
export interface FollowCheck {
  /** A selected row is in the list as shown (R35.2). */
  hasSelection: boolean;
  /** The row of the playing song in the list as shown, or null (R35.6). */
  target: number | null;
  /** The list's own busy state, for example a playlist edit on its way (R35.5). */
  busy?: boolean;
}

/**
 * Selection follow (R35, D63): at each change of the playing song, a list that has a selected
 * row as shown and shows the song selects that one row through `onFollow`, which also sets the
 * active row and scrolls it into view. Nothing here calls `focus()` (R35.4). `check` runs only at
 * a song change, so a long list does no work on other renders.
 */
export function useFollowPlaying(
  listRef: RefObject<HTMLElement | null>,
  check: () => FollowCheck,
  onFollow: (index: number) => void,
): void {
  const lastInput = useRef<number | null>(null);
  // A pointer pressed in the list and not released yet, for example a scrollbar drag (R35.5).
  const held = useRef(false);
  // Pointer, key and wheel input inside the list (R35.5). The list element can come and go
  // (an empty queue), so the document listens.
  useEffect(() => {
    const mark = (event: Event) => {
      if (!(event.target instanceof Node && listRef.current?.contains(event.target))) return;
      lastInput.current = Date.now();
      if (event.type === "pointerdown") held.current = true;
    };
    // The release can land outside the list. A move with no button down also ends the press,
    // for a release that the webview did not report.
    const release = (event: PointerEvent) => {
      if (!held.current || (event.type === "pointermove" && event.buttons !== 0)) return;
      held.current = false;
      lastInput.current = Date.now();
    };
    const kinds = ["pointerdown", "keydown", "wheel"] as const;
    const ends = ["pointerup", "pointercancel", "pointermove"] as const;
    for (const kind of kinds) document.addEventListener(kind, mark, { capture: true, passive: true });
    for (const kind of ends) document.addEventListener(kind, release, { capture: true, passive: true });
    return () => {
      for (const kind of kinds) document.removeEventListener(kind, mark, { capture: true });
      for (const kind of ends) document.removeEventListener(kind, release, { capture: true });
    };
  }, [listRef]);
  const latest = useRef({ check, onFollow });
  useLayoutEffect(() => {
    latest.current = { check, onFollow };
  });
  const follow = usePlayerStore((state) => state.follow);
  const seen = useRef(follow);
  useEffect(() => {
    if (follow === seen.current) return;
    seen.current = follow;
    const { hasSelection, target, busy = false } = latest.current.check();
    const now = Date.now();
    const listBusy = busy || held.current || menuDialogOrDrag();
    if (shouldFollow({ hasSelection, target, busy: listBusy, lastInput: lastInput.current, now })) {
      if (target !== null) latest.current.onFollow(target);
    }
  }, [follow]);
}
