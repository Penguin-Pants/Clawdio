import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_MS, useUiStore } from "./ui";

beforeEach(() => {
  vi.useFakeTimers();
  useUiStore.setState({ job: null, message: null, settingsOpen: false, visibleWidgets: [] });
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
});
