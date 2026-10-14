import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import tokens from "../theme/tokens.json";

// Unmount rendered components after each test, so queries see one test's DOM only.
afterEach(cleanup);

// jsdom has no layout, so it has no ResizeObserver. Components observe sizes; nothing resizes in tests.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoResizeObserver;

// jsdom loads no stylesheet: the size and spacing tokens (UD1) are set on the root as the CSS does.
// Files with the node environment have no document.
if (typeof document !== "undefined") {
  const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  for (const [name, value] of Object.entries(tokens.sizes)) {
    document.documentElement.style.setProperty(`--size-${kebab(name)}`, value);
  }
  document.documentElement.style.setProperty("--spacing-unit", tokens.spacing.unit);
}
