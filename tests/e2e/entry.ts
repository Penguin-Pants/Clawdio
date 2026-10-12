// E2E page entry (P2.15). The mocks install before the app starts.
import { setLyrics } from "./install-mocks";
import { emit } from "@tauri-apps/api/event";
import "../../src/main";
import { addWidget, getDock, replaceArrangement } from "../../src/shell/layouts";
import { WIDGET_IDS, type WidgetId } from "../../src/shell/widgets";

function dock() {
  const api = getDock();
  if (!api) throw new Error("e2e: no dock");
  return api;
}

/** Test hooks. They act on the real dock of the running app. */
const hooks = {
  /** Clears the dock and stacks all six widgets in one column (P2-AC6 clamp case). */
  stackAll(): void {
    replaceArrangement(dock(), (api) =>
      WIDGET_IDS.forEach((id, index) =>
        addWidget(api, id, index === 0 ? undefined : { referencePanel: WIDGET_IDS[index - 1], direction: "below" }),
      ),
    );
  },
  /** The minimum size the dock applies to the group of each widget (D33, D45 clamp). */
  groupMinimums(): Record<string, { width: number; height: number }> {
    const result: Record<string, { width: number; height: number }> = {};
    for (const group of dock().groups) {
      for (const panel of group.panels) {
        result[panel.id] = { width: group.minimumWidth, height: group.minimumHeight };
      }
    }
    return result;
  },
  /** Sends the window close request, like the close button (P9-AC11). */
  closeRequest(): Promise<void> {
    return emit("tauri://close-requested");
  },
  setLyrics,
  /** Adds a widget as a tab in the group of another widget. */
  addAsTab(id: WidgetId, reference: WidgetId): void {
    addWidget(dock(), id, { referencePanel: reference, direction: "within" });
  },
};

declare global {
  interface Window {
    e2e: typeof hooks;
  }
}
window.e2e = hooks;
