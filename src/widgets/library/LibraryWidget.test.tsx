import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_SELECTION, useLibraryStore } from "@/store/library";
import { LibraryWidget } from "./LibraryWidget";

beforeEach(() => useLibraryStore.setState({ mode: "columns", search: "", selection: EMPTY_SELECTION }));

describe("LibraryWidget (P2.8)", () => {
  it("shows the mode switch with the current mode pressed and a search field", () => {
    render(<LibraryWidget />);
    expect(screen.getByRole("button", { name: "Columns" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Tree" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("searchbox", { name: "Search" }).getAttribute("placeholder")).toBe("Search");
  });

  it("switches the body with the mode and keeps search text and selection (R28)", () => {
    useLibraryStore.setState({ selection: { artist: 3, album: null, song: null } });
    const { container } = render(<LibraryWidget />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "moon" } });
    fireEvent.click(screen.getByRole("button", { name: "Top/bottom" }));
    expect(container.querySelector("[data-library-body]")?.getAttribute("data-library-body")).toBe("topBottom");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("moon");
    expect(useLibraryStore.getState().selection.artist).toBe(3);
  });
});
