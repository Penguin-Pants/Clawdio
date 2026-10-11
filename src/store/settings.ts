import { create } from "zustand";
import { commands, type SettingsView } from "@/lib/ipc/commands";

/** Before the first read: no folder, nothing pending, so no prompt flashes at start. */
export const UNKNOWN_SETTINGS: SettingsView = {
  folderName: null,
  folderState: "none",
  onlineLookups: false,
  noticePending: false,
  portable: false,
};

interface SettingsState {
  view: SettingsView;
  loaded: boolean;
  set: (view: SettingsView) => void;
  load: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  view: UNKNOWN_SETTINGS,
  loaded: false,
  set: (view) => set({ view, loaded: true }),
  load: async () => {
    try {
      set({ view: await commands.settingsGet(), loaded: true });
    } catch {
      // No app shell: keep the defaults.
    }
  },
}));
