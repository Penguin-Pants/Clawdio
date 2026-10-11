import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applyAppName, useAppName } from "./app-name";

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

describe("useAppName", () => {
  it("returns the name once it is read", async () => {
    const readName = () => Promise.resolve("Example");
    const { result } = renderHook(() => useAppName(readName));
    expect(result.current).toBe("");
    await waitFor(() => expect(result.current).toBe("Example"));
  });

  it("stays empty when the name cannot be read", async () => {
    const readName = () => Promise.reject(new Error("no runtime"));
    const { result } = renderHook(() => useAppName(readName));
    await Promise.resolve();
    expect(result.current).toBe("");
  });
});
