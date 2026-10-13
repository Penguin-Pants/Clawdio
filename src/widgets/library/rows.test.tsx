import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenPx } from "@/lib/tokens";
import { flushFrames, installControlledLayout, resize } from "@/test/resize";
import { useAlbumRowHeight, useRowHeight } from "./rows";

function Heights() {
  return (
    <span data-testid="heights">
      {useRowHeight()} {useAlbumRowHeight()}
    </span>
  );
}

describe("row heights from tokens (TH-1, UD1)", () => {
  beforeEach(installControlledLayout);
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.fontSize = "";
  });

  it("equal the computed row tokens and follow a root font change", () => {
    document.documentElement.style.fontSize = "16px";
    render(<Heights />);
    expect(screen.getByTestId("heights").textContent).toBe(
      `${tokenPx("--size-row-regular")} ${tokenPx("--size-row-album")}`,
    );
    expect(screen.getByTestId("heights").textContent).toBe("28 48");
    document.documentElement.style.fontSize = "20px";
    const probe = document.querySelector("[data-token-probe]");
    if (!probe) throw new Error("no probe");
    act(() => {
      resize(probe, 20, 0);
      flushFrames();
    });
    expect(screen.getByTestId("heights").textContent).toBe("35 60");
  });
});
