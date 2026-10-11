import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string, protocol: string) => `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

const { thumbUrl } = await import("./thumbs");

describe("thumbUrl", () => {
  it("builds a thumb:// URL from the file name", () => {
    expect(thumbUrl("fixture-0001.jpg")).toBe("thumb://localhost/fixture-0001.jpg");
  });
});
