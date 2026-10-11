import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import monogramUrl from "../../../assets/branding/source/clawdio-monogram.svg";
import wordmarkUrl from "../../../assets/branding/export/clawdio-wordmark-primary.svg";
import { ArtPlaceholder } from "./ArtPlaceholder";
import { Wordmark } from "./Wordmark";

vi.mock("@tauri-apps/api/app", () => ({ getName: () => Promise.resolve("Example") }));

describe("Wordmark", () => {
  it("shows the primary wordmark with the app name as its text alternative", async () => {
    render(<Wordmark className="h-5" />);
    const image = await waitFor(() => screen.getByRole("img", { name: "Example" }));
    expect(image.getAttribute("src")).toBe(wordmarkUrl);
    expect(image.className).toBe("h-5");
  });
});

describe("ArtPlaceholder", () => {
  it("draws the monogram mask in the muted text color on the elevated surface", () => {
    const { container } = render(<ArtPlaceholder className="size-10" />);
    const square = container.firstElementChild as HTMLElement;
    const mark = container.querySelector<HTMLElement>("[data-slot='art-placeholder-mark']");
    expect(square.getAttribute("aria-hidden")).toBe("true");
    expect(square.className.split(" ")).toEqual(expect.arrayContaining(["bg-bg-elevated", "size-10"]));
    expect(mark?.className.split(" ")).toContain("bg-text-muted");
    expect(mark?.style.maskImage).toBe(`url("${monogramUrl}")`);
  });
});
