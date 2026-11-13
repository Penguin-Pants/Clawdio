import { commands, type SelectionRestore } from "@/lib/ipc/commands";
import { on } from "@/lib/ipc/events";
import { type LibrarySelection, useLibraryStore } from "./library";

/**
 * The Library selection restore at startup (R37, D66).
 *
 * - The restore token is set at start, before any `await`. A user selection change or a
 *   music folder change (a "none" answer) clears it. An answer applies only while it is set.
 * - The answer comes from the `library-selection-restored` event or from one ask at start,
 *   made after the listener is registered, so an event sent before the listener is not lost.
 * - The answer waits until the arrangement restore has set the saved Library mode
 *   (`markArranged`), so the default view that mounts first does not take it. The flag is
 *   not reset at start: the shell's arrangement can finish before the App effect runs.
 * - Every selection change is sent to Rust, which saves it (R37.2). The restore's own change
 *   is sent too: Rust saves the echo, not a user change.
 */

let token = false;
let held: LibrarySelection | null = null;
let arranged = false;

type Listen = (name: "library-selection-restored", handler: (answer: SelectionRestore) => void) => Promise<() => void>;

function apply() {
  if (!token || !arranged || held === null) return;
  const selection = held;
  token = false;
  held = null;
  useLibraryStore.getState().restoreSelection(selection);
}

function answer(value: SelectionRestore) {
  if (value.kind === "pending" || !token) return;
  if (value.kind === "none") {
    token = false;
    held = null;
    return;
  }
  held = value.selection;
  apply();
}

/** The arrangement restore has set the saved Library mode (P26.3): a held answer applies now. */
export function markArranged() {
  arranged = true;
  apply();
}

/**
 * Starts the restore and the selection saves. Returns a function that stops both.
 * `listen` is the event listener (a test passes its own).
 */
export function startSelectionRestore(listen: Listen = on): () => void {
  token = true;
  held = null;
  const unsubscribe = useLibraryStore.subscribe((state, previous) => {
    if (state.selection === previous.selection) return;
    if (state.restoreSeq === previous.restoreSeq) {
      // A user change wins over an answer in flight, held or not yet asked for.
      token = false;
      held = null;
    }
    const { artist, album, song } = state.selection;
    void commands.librarySelectionSave({ artist, album, song }).catch(() => {
      // The next change saves again; a failed save loses nothing the user sees.
    });
  });
  let stopped = false;
  let unlisten: (() => void) | null = null;
  void (async () => {
    const stop = await listen("library-selection-restored", answer);
    if (stopped) {
      stop();
      return;
    }
    unlisten = stop;
    if (!token) return;
    answer(await commands.librarySelectionRestored().catch((): SelectionRestore => ({ kind: "none" })));
  })();
  return () => {
    stopped = true;
    token = false;
    held = null;
    arranged = false;
    unsubscribe();
    unlisten?.();
  };
}
