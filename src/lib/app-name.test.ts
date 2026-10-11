import { describe, expect, it } from "vitest";
import { applyAppName } from "./app-name";

describe("applyAppName", () => {
  it("sets the document title to the name the app reports", async () => {
    document.title = "";
    await applyAppName(async () => "Example");
    expect(document.title).toBe("Example");
  });

  it("keeps the title when the name cannot be read", async () => {
    document.title = "before";
    await applyAppName(() => Promise.reject(new Error("no runtime")));
    expect(document.title).toBe("before");
  });
});
