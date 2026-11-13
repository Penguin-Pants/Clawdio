import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type LibrarySelectionIds, type SelectionRestore } from "@/lib/ipc/commands";
import { EMPTY_SELECTION, useLibraryStore } from "./library";
import { markArranged, startSelectionRestore } from "./selection-restore";

const SAVED: LibrarySelectionIds = { artist: 1, album: 2, song: 3 };
const answerOf = (selection: LibrarySelectionIds = SAVED): SelectionRestore => ({ kind: "selection", selection });

/** A fake event listener: `ready` resolves the registration, `send` fires the event. */
function fakeListen() {
  let handler: ((answer: SelectionRestore) => void) | null = null;
  let resolve: () => void = () => {};
  const registered = new Promise<void>((done) => (resolve = done));
  const listen = vi.fn((_name: string, next: (answer: SelectionRestore) => void) => {
    handler = next;
    return registered.then(() => () => {});
  });
  return { listen, ready: () => resolve(), send: (answer: SelectionRestore) => handler?.(answer) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const state = () => useLibraryStore.getState();

let stop: () => void = () => {};
let saves: unknown[];

beforeEach(() => {
  useLibraryStore.setState({ selection: EMPTY_SELECTION, selectedSongs: new Set(), anchor: null, restoreSeq: 0 });
  saves = [];
  vi.spyOn(commands, "librarySelectionSave").mockImplementation(async (selection) => {
    saves.push(selection);
  });
});

afterEach(() => {
  stop();
  vi.restoreAllMocks();
});

describe("selection restore (R37, D66)", () => {
  it("asks only after the listener is registered, holds the answer until the arrangement, then applies it once", async () => {
    const ask = vi.spyOn(commands, "librarySelectionRestored").mockResolvedValue(answerOf());
    const events = fakeListen();
    stop = startSelectionRestore(events.listen);
    await flush();
    expect(ask).not.toHaveBeenCalled();
    events.ready();
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(state().selection).toEqual(EMPTY_SELECTION);
    markArranged();
    expect(state().selection).toEqual(SAVED);
    expect([...state().selectedSongs]).toEqual([3]);
    expect(state().anchor).toBe(3);
    expect(state().restoreSeq).toBe(1);
    // The echo of the restore is saved; a later answer does not apply again.
    expect(saves).toEqual([SAVED]);
    events.send(answerOf({ artist: 9, album: null, song: null }));
    expect(state().selection).toEqual(SAVED);
  });

  it("applies the event that follows a pending answer at mount", async () => {
    vi.spyOn(commands, "librarySelectionRestored").mockResolvedValue({ kind: "pending" });
    const events = fakeListen();
    markArranged();
    stop = startSelectionRestore(events.listen);
    events.ready();
    await flush();
    expect(state().restoreSeq).toBe(0);
    events.send(answerOf());
    expect(state().selection).toEqual(SAVED);
  });

  it("keeps a user selection made before the ask, while the reply is in flight or while the answer waits", async () => {
    const cases: ((events: ReturnType<typeof fakeListen>) => Promise<void>)[] = [
      // Before the ask: the listener registration is slow.
      async (events) => {
        state().setSelection({ artist: 5, album: null, song: null });
        events.ready();
        await flush();
        markArranged();
      },
      // While the reply is in flight.
      async (events) => {
        events.ready();
        state().setSelection({ artist: 5, album: null, song: null });
        await flush();
        markArranged();
      },
      // While the answer waits for the saved mode.
      async (events) => {
        events.ready();
        await flush();
        state().setSelection({ artist: 5, album: null, song: null });
        markArranged();
      },
    ];
    for (const run of cases) {
      stop();
      useLibraryStore.setState({ selection: EMPTY_SELECTION, restoreSeq: 0 });
      vi.spyOn(commands, "librarySelectionRestored").mockResolvedValue(answerOf());
      const events = fakeListen();
      stop = startSelectionRestore(events.listen);
      await run(events);
      expect(state().selection).toEqual({ artist: 5, album: null, song: null });
      expect(state().restoreSeq).toBe(0);
    }
  });

  it("drops the restore on a music folder change (a none answer) at any point", async () => {
    vi.spyOn(commands, "librarySelectionRestored").mockResolvedValue({ kind: "pending" });
    const events = fakeListen();
    stop = startSelectionRestore(events.listen);
    events.ready();
    await flush();
    events.send({ kind: "none" });
    events.send(answerOf());
    markArranged();
    expect(state().restoreSeq).toBe(0);
    expect(state().selection).toEqual(EMPTY_SELECTION);
  });

  it("drops a held answer when a none answer comes before the arrangement", async () => {
    vi.spyOn(commands, "librarySelectionRestored").mockResolvedValue(answerOf());
    const events = fakeListen();
    stop = startSelectionRestore(events.listen);
    events.ready();
    await flush();
    events.send({ kind: "none" });
    markArranged();
    expect(state().restoreSeq).toBe(0);
  });

  it("sends every selection change to Rust as three ids", async () => {
    vi.spyOn(commands, "librarySelectionRestored").mockResolvedValue({ kind: "none" });
    const events = fakeListen();
    stop = startSelectionRestore(events.listen);
    events.ready();
    await flush();
    state().setSelection({ artist: 4, album: null, song: null });
    state().setSongSelection(new Set([7, 8]), 7, 8);
    expect(saves).toEqual([
      { artist: 4, album: null, song: null },
      { artist: 4, album: null, song: 8 },
    ]);
  });
});
