// PF-3 (P30): entering Arrange mode adds the covers without rendering the widget bodies again.
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUiStore } from "@/store/ui";

const renders = vi.hoisted(() => ({ count: 0 }));

vi.mock("./widgets", async (importOriginal) => {
  const real = await importOriginal<typeof import("./widgets")>();
  const Counted = (): null => {
    renders.count += 1;
    return null;
  };
  const widgets = Object.fromEntries(
    Object.entries(real.WIDGETS).map(([id, widget]) => [id, { ...widget, component: Counted }]),
  ) as unknown as typeof real.WIDGETS;
  return { ...real, WIDGETS: widgets };
});

const { GridShell } = await import("./GridShell");

describe("GridShell (PF-3, P30)", () => {
  it("does not render the widget bodies again when Arrange mode toggles", () => {
    const { container } = render(<GridShell />);
    const before = renders.count;
    expect(before).toBeGreaterThan(0);
    act(() => useUiStore.getState().setArranging(true));
    expect(container.querySelectorAll("[data-arrange]").length).toBeGreaterThan(0);
    act(() => useUiStore.getState().setArranging(false));
    expect(renders.count).toBe(before);
  });
});
