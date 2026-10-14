import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as log from "@/lib/log";
import { useColumnsStore } from "@/store/columns";
import { DEFAULT_COLUMNS } from "@/widgets/library/columns";
import {
  COLUMNS_VERSION,
  SAVE_DELAY_MS,
  currentColumns,
  parseColumnsFile,
  restoreColumns,
  watchColumns,
} from "./columns-persistence";

vi.mock("@/lib/log", () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

const valid = () =>
  JSON.stringify({
    version: 1,
    density: "regular",
    views: { "songs.columns": DEFAULT_COLUMNS["songs.columns"], "songs.topBottom": DEFAULT_COLUMNS["songs.topBottom"] },
  });

beforeEach(() => {
  vi.mocked(log.warn).mockClear();
  useColumnsStore.setState({ density: "regular", views: DEFAULT_COLUMNS });
});
afterEach(() => vi.useRealTimers());

describe("columns.json (PS-6, UD13)", () => {
  it("parses a valid file and keeps each view", () => {
    const parsed = parseColumnsFile(valid());
    expect(parsed).toMatchObject({ file: { density: "regular", views: DEFAULT_COLUMNS }, warnings: [] });
    expect(COLUMNS_VERSION).toBe(1);
  });

  it.each([
    ["{", "not valid JSON"],
    ['{"version": 2, "views": {}}', "unknown columns version 2"],
    ['{"version": 1}', "no views"],
  ])("rejects %s", (text, reason) => {
    expect(parseColumnsFile(text)).toMatchObject({ reason: expect.stringContaining(reason) });
  });

  it("an unknown view key is ignored with a warning; a missing view takes its defaults", () => {
    const text = JSON.stringify({ version: 1, density: "regular", views: { albums: {} } });
    const parsed = parseColumnsFile(text);
    expect(parsed).toMatchObject({ file: { views: DEFAULT_COLUMNS }, warnings: ["unknown view albums ignored"] });
  });

  it("round-trips compact density, and a bad density loads regular with a warning (TB-14)", () => {
    useColumnsStore.getState().setDensity("compact");
    const parsed = parseColumnsFile(JSON.stringify(currentColumns()));
    expect(parsed).toMatchObject({ file: { density: "compact" }, warnings: [] });
    const bad = parseColumnsFile(JSON.stringify({ ...currentColumns(), density: "tiny" }));
    expect(bad).toMatchObject({ file: { density: "regular" }, warnings: ['invalid density "tiny"; using regular'] });
  });

  it("restores a valid file into the store", async () => {
    const changed = { ...DEFAULT_COLUMNS["songs.topBottom"], hidden: ["album" as const] };
    const text = JSON.stringify({ version: 1, density: "regular", views: { "songs.topBottom": changed } });
    await restoreColumns(async () => text, vi.fn());
    expect(useColumnsStore.getState().views["songs.topBottom"].hidden).toEqual(["album"]);
  });

  it("keeps a column edit the user made while the file loaded", async () => {
    let resolve: (text: string) => void = () => {};
    const loading = restoreColumns(() => new Promise((done) => (resolve = done)));
    useColumnsStore.getState().setDensity("compact");
    resolve(valid());
    await loading;
    expect(useColumnsStore.getState().density).toBe("compact");
  });

  it("backs up a bad file and keeps the defaults, with one log line (PS-4)", async () => {
    const backup = vi.fn(async () => {});
    await restoreColumns(async () => "{", backup);
    expect(backup).toHaveBeenCalledTimes(1);
    expect(useColumnsStore.getState().views).toEqual(DEFAULT_COLUMNS);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(log.warn).mock.calls[0][0]).toContain("columns.json.bak");
  });

  it("saves 500 ms after a change and at once on flush", async () => {
    vi.useFakeTimers();
    const save = vi.fn<(json: string) => Promise<void>>(async () => {});
    const watcher = watchColumns(save);
    useColumnsStore.getState().update("songs.columns", (state) => ({ ...state, hidden: [] }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(save.mock.calls[0][0]).views["songs.columns"].hidden).toEqual([]);
    await watcher.flush();
    expect(save).toHaveBeenCalledTimes(2);
    watcher.dispose();
  });
});
