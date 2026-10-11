import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ICONS, Icon, overridesFromFiles } from "./icons";

describe("Icon (P2.13, R31)", () => {
  it("renders the Lucide icon of the name when no override exists", () => {
    const { container } = render(<Icon name="menu" overrides={{}} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-icon")).toBe("menu");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("replaces the icon of that name with the override through a CSS mask (P2-AC11)", () => {
    const { container } = render(<Icon name="menu" overrides={{ menu: "/brand/menu.svg" }} className="size-5" />);
    expect(container.querySelector("svg")).toBeNull();
    const mask = container.querySelector<HTMLElement>("[data-slot='mask-icon']");
    expect(mask?.dataset.icon).toBe("menu");
    expect(mask?.style.maskImage).toBe('url("/brand/menu.svg")');
    expect(mask?.className.split(" ")).toEqual(expect.arrayContaining(["bg-current", "size-5"]));
  });

  it("keeps other icons when one is replaced", () => {
    const { container } = render(<Icon name="play" overrides={{ menu: "/brand/menu.svg" }} />);
    expect(container.querySelector("svg")?.getAttribute("data-icon")).toBe("play");
  });
});

describe("overridesFromFiles", () => {
  it("maps file names to icon names and ignores unknown names", () => {
    expect(
      overridesFromFiles({
        "../../assets/branding/ui-icons/menu.svg": "/a.svg",
        "../../assets/branding/ui-icons/topBottom.svg": "/b.svg",
        "../../assets/branding/ui-icons/unknown.svg": "/c.svg",
      }),
    ).toEqual({ menu: "/a.svg", topBottom: "/b.svg" });
  });

  it("names every icon the README lists", () => {
    expect(Object.keys(ICONS)).toContain("close");
  });
});
