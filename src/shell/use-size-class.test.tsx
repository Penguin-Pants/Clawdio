import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushFrames, installControlledLayout, resize } from "@/test/resize";
import { sizeClassOf, useSizeClass, type SizeClass } from "./use-size-class";

describe("sizeClassOf (UD3)", () => {
  it.each<[number, SizeClass]>([
    [300, "xs"],
    [419, "xs"],
    [420, "sm"],
    [639, "sm"],
    [640, "md"],
    [899, "md"],
    [900, "lg"],
    [1199, "lg"],
    [1200, "xl"],
    [2560, "xl"],
  ])("%i px is %s", (width, expected) => {
    expect(sizeClassOf(width)).toBe(expected);
  });
});

describe("useSizeClass (TR-2, PF-2)", () => {
  beforeEach(installControlledLayout);
  afterEach(() => vi.unstubAllGlobals());

  it("measures its element and updates state once per frame", () => {
    const seen: SizeClass[] = [];
    function Band() {
      const ref = useRef<HTMLDivElement>(null);
      const size = useSizeClass(ref);
      seen.push(size);
      return <div ref={ref} data-testid="band" />;
    }
    const { getByTestId } = render(<Band />);
    const band = getByTestId("band");
    const before = seen.length;
    act(() => {
      resize(band, 500, 56);
      resize(band, 1300, 56);
      flushFrames();
    });
    expect(seen.length - before).toBe(1);
    expect(seen.at(-1)).toBe("xl");
  });
});
