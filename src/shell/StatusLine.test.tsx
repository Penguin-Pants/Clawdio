import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/store/ui";
import { StatusLine } from "./StatusLine";

beforeEach(() => useUiStore.setState({ job: null, message: null }));

describe("StatusLine (P2.7)", () => {
  it("shows Ready when idle", () => {
    render(<StatusLine />);
    expect(screen.getByRole("status").textContent).toBe("Ready");
  });

  it("shows a job with a Cancel button that calls its cancel function", () => {
    const cancel = vi.fn();
    useUiStore.setState({ job: { id: "scan", text: "Scanning", cancel } });
    render(<StatusLine />);
    expect(screen.getByRole("status").textContent).toBe("Scanning");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("shows a transient message over the job, then the job again", () => {
    vi.useFakeTimers();
    useUiStore.setState({ job: { id: "scan", text: "Scanning", cancel: () => {} } });
    render(<StatusLine />);
    act(() => useUiStore.getState().showMessage("Added to queue"));
    expect(screen.getByRole("status").textContent).toBe("Added to queue");
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status").textContent).toBe("Scanning");
    vi.useRealTimers();
  });
});
