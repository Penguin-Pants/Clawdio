import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the header strip with the menu button, the dock and the status line", () => {
    render(<App />);
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("contentinfo").textContent).toBe("Ready");
  });
});
