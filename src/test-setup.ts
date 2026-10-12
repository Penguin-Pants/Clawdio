import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components after each test, so queries see one test's DOM only.
afterEach(cleanup);

// jsdom has no layout, so it has no ResizeObserver. Components observe sizes; nothing resizes in tests.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoResizeObserver;
