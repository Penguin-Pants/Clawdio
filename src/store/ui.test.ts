import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_MS, useUiStore } from "./ui";

beforeEach(() => {
  vi.useFakeTimers();
  useUiStore.setState({ jobs: [], job: null, message: null, settingsOpen: false, visibleWidgets: [] });
});
afterEach(() => vi.useRealTimers());

describe("ui store (P2.7, D18)", () => {
  it("shows a message for 5 s", () => {
    useUiStore.getState().showMessage("Added to queue");
    expect(useUiStore.getState().message).toBe("Added to queue");
    vi.advanceTimersByTime(MESSAGE_MS - 1);
    expect(useUiStore.getState().message).toBe("Added to queue");
    vi.advanceTimersByTime(1);
    expect(useUiStore.getState().message).toBeNull();
    expect(MESSAGE_MS).toBe(5000);
  });

  it("restarts the 5 s for a new message", () => {
    useUiStore.getState().showMessage("one");
    vi.advanceTimersByTime(4000);
    useUiStore.getState().showMessage("two");
    vi.advanceTimersByTime(4000);
    expect(useUiStore.getState().message).toBe("two");
  });

  it("updates and ends only the job with the same id", () => {
    const store = useUiStore.getState();
    store.startJob({ id: "scan", text: "Scanning" });
    store.updateJob("other", "x");
    store.updateJob("scan", "Scanning: 10 files");
    expect(useUiStore.getState().job?.text).toBe("Scanning: 10 files");
    store.endJob("other");
    expect(useUiStore.getState().job).not.toBeNull();
    store.endJob("scan");
    expect(useUiStore.getState().job).toBeNull();
  });

  it("shows the newest of two jobs and returns to the other when it ends (R5)", () => {
    const store = useUiStore.getState();
    const cancelArt = () => {};
    store.startJob({ id: "artwork", text: "Fetching artwork: 1 of 9 albums", cancel: cancelArt });
    store.startJob({ id: "lyrics", text: "Fetching lyrics" });
    expect(useUiStore.getState().job?.id).toBe("lyrics");
    store.updateJob("artwork", "Fetching artwork: 2 of 9 albums");
    expect(useUiStore.getState().job?.id).toBe("lyrics");
    store.endJob("lyrics");
    expect(useUiStore.getState().job).toEqual({
      id: "artwork",
      text: "Fetching artwork: 2 of 9 albums",
      cancel: cancelArt,
    });
    expect(useUiStore.getState().hasJob("artwork")).toBe(true);
    store.endJob("artwork");
    expect(useUiStore.getState().job).toBeNull();
  });

  it("sets the lock and the transport band position (DK-5, SH-6)", () => {
    useUiStore.setState({ locked: false, transportPosition: "top" });
    useUiStore.getState().setLocked(true);
    useUiStore.getState().setTransportPosition("bottom");
    expect(useUiStore.getState()).toMatchObject({ locked: true, transportPosition: "bottom" });
  });
});
