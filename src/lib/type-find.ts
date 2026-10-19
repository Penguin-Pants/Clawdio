import { type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { FindHit } from "@/lib/ipc/commands";

/** The typed text resets after this time with no character (R36.3, a starting value). */
export const FIND_RESET_MS = 1000;

/**
 * The typed text of the list that took the last character (D65). One list has keyboard focus
 * at a time, so one text is enough.
 */
let typed: { owner: EventTarget | null; text: string; at: number } = { owner: null, text: "", at: 0 };

/** The list `target` has a typed text that has not reset yet (R36.3). */
export function findTextActive(target: EventTarget | null): boolean {
  return target !== null && typed.owner === target && typed.text !== "" && Date.now() - typed.at < FIND_RESET_MS;
}

/** A menu, a dialog or a row drag is open: keys and pointer input belong to it (R35.5, R36). */
export function menuDialogOrDrag(doc: Document = document): boolean {
  return doc.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"], [data-slot="drag-ghost"]') !== null;
}

/** One printable character with no Ctrl, Alt or Meta key; Shift is allowed (R36.2). */
function typedCharacter(event: KeyboardEvent<HTMLElement>): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return null;
  return [...event.key].length === 1 ? event.key : null;
}

export interface TypeFind {
  /**
   * The list as shown. A reply for another list (a search, sort, edit or expand change) is
   * dropped. Compared by identity.
   */
  list: unknown;
  /** The index of the first row whose name starts with `text`, or null (R36.4). */
  find: (text: string) => Promise<number | null> | number | null;
  /** A match: move the active row and the selection as one Down key does, and scroll (R36.7). */
  onMatch: (index: number) => void;
}

/**
 * Type-to-find (R36, D65). Returns the list's key handler: true when it took the key. The
 * key must land on the list element itself, so a focused column header keeps its keys. Space
 * adds to an active text and is not a find key otherwise (R36.6, D17). Each request has a
 * number: only the reply to the latest request counts, so a slow `z` reply cannot replace a
 * later `zz` match, also when the `zz` request failed.
 */
export function useTypeFind({ list, find, onMatch }: TypeFind): (event: KeyboardEvent<HTMLElement>) => boolean {
  const latest = useRef({ list, find, onMatch });
  useLayoutEffect(() => {
    latest.current = { list, find, onMatch };
  });
  const sent = useRef(0);
  // A list that goes away (a Library mode change) drops its pending reply.
  useEffect(
    () => () => {
      sent.current += 1;
    },
    [],
  );
  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return false;
    const character = typedCharacter(event);
    if (character === null) return false;
    const owner = event.currentTarget;
    const active = findTextActive(owner);
    if (character === " " && !active) return false;
    // The open control takes the keys (requirements section 5, v1.11).
    if (menuDialogOrDrag(owner.ownerDocument)) return false;
    event.preventDefault();
    typed = { owner, text: (active ? typed.text : "") + character, at: Date.now() };
    sent.current += 1;
    const request = sent.current;
    const shown = latest.current.list;
    const land = (index: number | null) => {
      // Only the reply to the latest typed text counts, and only while that text is active: a
      // reply after the 1 s reset is for a text that is gone (R36.3).
      if (request !== sent.current || latest.current.list !== shown || !findTextActive(owner)) return;
      if (menuDialogOrDrag(owner.ownerDocument)) return;
      // No match: the active row and the selection do not change (R36.8).
      if (index !== null) latest.current.onMatch(index);
    };
    void Promise.resolve(latest.current.find(typed.text)).then(land, () => {
      // A failed request is no match: nothing changes (R36.8).
    });
    return true;
  }, []);
}

/**
 * The row of a core hit in the list as shown, plus `offset` (the "All" row), or null when the
 * shown row at that index has another id: the core read a list that changed (D65).
 */
export function shownIndex(
  hit: FindHit | null,
  idAt: (index: number) => number | null | undefined,
  offset = 0,
): number | null {
  return hit !== null && idAt(hit.index) === hit.id ? hit.index + offset : null;
}

/**
 * NFD, combining marks removed, then each character lowercased on its own: the R3 fold of the
 * core (D4, `char::to_lowercase`). A whole-string lowercase would give a final sigma.
 */
function foldName(text: string): string {
  return [...text.normalize("NFD").replace(/\p{M}/gu, "")].map((character) => character.toLowerCase()).join("");
}

/** The first of `names` (as shown, top to bottom) that starts with `text`, folded as in R3. */
export function firstMatch(names: readonly string[], text: string): number | null {
  const prefix = foldName(text);
  if (prefix === "") return null;
  const index = names.findIndex((name) => foldName(name).startsWith(prefix));
  return index >= 0 ? index : null;
}
