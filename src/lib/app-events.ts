import { commands } from "@/lib/ipc/commands";
import { on } from "@/lib/ipc/events";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

/**
 * Connects the app events to the stores. Returns a function that disconnects them.
 */
export function connectAppEvents(): () => void {
  const subscriptions = [
    on("library-changed", () => useLibraryStore.getState().bumpVersion()),
    on("settings-changed", (view) => useSettingsStore.getState().set(view)),
    on("player-state", (event) => usePlayerStore.getState().apply(event)),
    on("player-position", (positionMs) => usePlayerStore.getState().setPosition(positionMs)),
    on("status-message", (text) => useUiStore.getState().showMessage(text)),
    on("job-progress", ({ id, text, cancelable }) => {
      const ui = useUiStore.getState();
      if (text === null) ui.endJob(id);
      else if (ui.job?.id === id) ui.updateJob(id, text);
      else ui.startJob({ id, text, cancel: cancelable ? () => void commands.cancelJob(id) : undefined });
    }),
  ];
  return () => {
    for (const subscription of subscriptions) void subscription.then((unlisten) => unlisten());
  };
}
