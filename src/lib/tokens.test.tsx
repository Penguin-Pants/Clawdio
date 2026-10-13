import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushFrames, installControlledLayout, resize } from "@/test/resize";
import { tokenPx, useTokenPx } from "./tokens";

function Probe() {
  return <span data-testid="value">{useTokenPx("--size-transport-bar")}</span>;
}

describe("useTokenPx (UD1)", () => {
  beforeEach(installControlledLayout);
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.fontSize = "";
  });

  it("resolves a rem token at the root font size", () => {
    document.documentElement.style.fontSize = "16px";
    expect(tokenPx("--size-transport-bar")).toBe(56);
    document.documentElement.style.fontSize = "20px";
    expect(tokenPx("--size-transport-bar")).toBe(70);
  });

  it("reads the value again when the root font size changes", () => {
    document.documentElement.style.fontSize = "16px";
    render(<Probe />);
    expect(screen.getByTestId("value").textContent).toBe("56");
    document.documentElement.style.fontSize = "20px";
    const probe = document.querySelector("[data-token-probe]");
    if (!probe) throw new Error("no probe");
    act(() => {
      resize(probe, 20, 0);
      flushFrames();
    });
    expect(screen.getByTestId("value").textContent).toBe("70");
  });
});
