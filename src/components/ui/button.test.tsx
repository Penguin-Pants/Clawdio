import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders a button with its label", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
  });

  it("fills the default variant with state.redActive in every state (D10)", () => {
    render(<Button>Save</Button>);
    const classes = screen.getByRole("button").className.split(/\s+/);
    expect(classes).toContain("bg-state-red-active");
    expect(classes.filter((name) => /(^|:)bg-(primary|state-red-hover|brand-red)/.test(name))).toEqual([]);
  });

  it.each(["destructive", "link"] as const)("uses primary text, not red text, in the %s variant (D10)", (variant) => {
    render(<Button variant={variant}>Delete</Button>);
    const classes = screen.getByRole("button").className.split(/\s+/);
    expect(classes).toContain("text-foreground");
    expect(classes.filter((name) => /^text-(primary|destructive)$/.test(name))).toEqual([]);
  });
});
