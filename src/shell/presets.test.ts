import type { DockviewApi } from "dockview-react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FRAMES, useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { applyPreset, resetLayout, visibleWidgets } from "./layouts";
import { DEFAULT_PRESET, PRESETS, PRESET_IDS } from "./presets";

interface Added {
  id: string;
  position?: unknown;
  initialWidth?: number;
  inactive?: boolean;
}

/** A dock stand-in with a size, so the presets set their pixel widths. */
function dockStandIn() {
  const panels: Added[] = [];
  const sizes: [string, unknown][] = [];
  const api = {
    width: 1280,
    height: 700,
    addPanel: (options: Added) => panels.push(options),
    getPanel: (id: string) => {
      const panel = panels.find((added) => added.id === id);
      return (
        panel && {
          ...panel,
          api: { setActive: () => {} },
          group: { api: { setSize: (size: unknown) => sizes.push([id, size]) } },
        }
      );
    },
    removePanel: ({ id }: { id: string }) =>
      panels.splice(
        panels.findIndex((panel) => panel.id === id),
        1,
      ),
    clear: () => panels.splice(0),
  };
  return { api: api as unknown as DockviewApi, panels, sizes };
}

beforeEach(() => {
  useLibraryStore.setState({ mode: "columns", frames: DEFAULT_FRAMES });
  useUiStore.setState({ transportPosition: "top", locked: false });
});

describe("presets (DK-8, DK-9, UD6)", () => {
  it("lists the three presets with the default first", () => {
    expect(PRESET_IDS).toEqual(["appleMusicClassic", "musicBee", "compact"]);
    expect(PRESET_IDS.map((id) => PRESETS[id].title)).toEqual(["Apple Music classic", "MusicBee style", "Compact"]);
    expect(DEFAULT_PRESET).toBe("appleMusicClassic");
  });

  it("Apple Music classic: Playlists left at 240 px, Play queue and Lyrics right at 280 px", () => {
    const { api, panels, sizes } = dockStandIn();
    applyPreset("appleMusicClassic", api);
    expect(panels.map((panel) => [panel.id, panel.position])).toEqual([
      ["library", undefined],
      ["playlists", { referencePanel: "library", direction: "left" }],
      ["queue", { referencePanel: "library", direction: "right" }],
      ["lyrics", { referencePanel: "queue", direction: "within" }],
    ]);
    expect(sizes).toContainEqual(["playlists", { width: 240 }]);
    expect(sizes).toContainEqual(["queue", { width: 280 }]);
  });

  it("MusicBee style: Playlists left top, Now playing below it, Play queue right, Lyrics hidden", () => {
    const { api, panels, sizes } = dockStandIn();
    applyPreset("musicBee", api);
    expect(panels.map((panel) => [panel.id, panel.position])).toEqual([
      ["library", undefined],
      ["playlists", { referencePanel: "library", direction: "left" }],
      ["nowPlaying", { referencePanel: "playlists", direction: "below" }],
      ["queue", { referencePanel: "library", direction: "right" }],
    ]);
    expect(visibleWidgets(api)).not.toContain("lyrics");
    expect(sizes).toContainEqual(["playlists", { width: 240 }]);
    expect(sizes).toContainEqual(["queue", { width: 280 }]);
  });

  it("Compact leaves only Library", () => {
    const { api } = dockStandIn();
    applyPreset("compact", api);
    expect(visibleWidgets(api)).toEqual(["library"]);
  });

  it("a preset keeps the Library mode, the band position and the lock", () => {
    useLibraryStore.setState({ mode: "tree" });
    useUiStore.setState({ transportPosition: "bottom", locked: true });
    applyPreset("musicBee", dockStandIn().api);
    expect(useLibraryStore.getState().mode).toBe("tree");
    expect(useUiStore.getState()).toMatchObject({ transportPosition: "bottom", locked: true });
  });

  it("resetLayout restores the default preset, Columns, the default frames, top and unlocked (DK-7)", () => {
    const { api } = dockStandIn();
    applyPreset("compact", api);
    useLibraryStore.setState({ mode: "tree" });
    useLibraryStore.getState().setFrames("columns", [0.1, 0.1, 0.8]);
    useUiStore.setState({ transportPosition: "bottom", locked: true });
    resetLayout(api);
    expect(visibleWidgets(api)).toEqual(["library", "playlists", "queue", "lyrics"]);
    expect(useLibraryStore.getState()).toMatchObject({ mode: "columns", frames: DEFAULT_FRAMES });
    expect(useUiStore.getState()).toMatchObject({ transportPosition: "top", locked: false });
  });
});
