import type { DockviewApi } from "dockview-react";
import { addWidget } from "./layouts";

/** Pixel widths of the side groups in the presets (UD6, SP-4: sidebars use pixels). */
export const SIDEBAR_WIDTH = 240;
export const RIGHT_WIDTH = 280;

/**
 * "Apple Music classic", the default preset (DK-8, UD6): Playlists at the left, Library in the
 * center, Play queue and Lyrics as tabs in one group at the right with Play queue active, Now
 * playing hidden. First run and Reset layout apply it.
 */
export function appleMusicClassic(api: DockviewApi): void {
  addWidget(api, "library");
  addWidget(api, "playlists", { referencePanel: "library", direction: "left" }, { width: SIDEBAR_WIDTH });
  addWidget(api, "queue", { referencePanel: "library", direction: "right" }, { width: RIGHT_WIDTH });
  addWidget(api, "lyrics", { referencePanel: "queue", direction: "within" }, { inactive: true });
  applySideWidths(api);
  api.getPanel("library")?.api.setActive();
}

/**
 * Sets the side groups to their preset pixel widths once the dock has a size. A preset that
 * runs before the first layout keeps Dockview's initial widths; the start path calls this again.
 */
export function applySideWidths(api: DockviewApi): void {
  if (!(api.width > 0)) return;
  api.getPanel("playlists")?.group.api.setSize({ width: SIDEBAR_WIDTH });
  api.getPanel("queue")?.group.api.setSize({ width: RIGHT_WIDTH });
}
