import { create } from "zustand";
import type { ImportReport } from "@/lib/ipc/commands";
import type { WidgetId } from "@/shell/widgets";

/** How long a transient status message shows (D18). */
export const MESSAGE_MS = 5000;

/** The app's small dialogs: a new playlist name, a delete confirmation, an error (P11). */
export type AppDialog =
  | { kind: "newPlaylist"; addTracks?: number[] }
  | { kind: "deletePlaylist"; id: number; fileName: string }
  | { kind: "error"; text: string }
  | { kind: "importReport"; reports: ImportReport[] };

/** A running job in the status line (R5). `cancel` is absent when the job cannot be canceled. */
export interface StatusJob {
  id: string;
  text: string;
  cancel?: () => void;
}

interface UiState {
  /** Widgets that are in the dock now, in registry order. */
  visibleWidgets: WidgetId[];
  settingsOpen: boolean;
  job: StatusJob | null;
  message: string | null;
  dialog: AppDialog | null;
  openDialog: (dialog: AppDialog) => void;
  closeDialog: () => void;
  setVisibleWidgets: (ids: WidgetId[]) => void;
  setSettingsOpen: (open: boolean) => void;
  startJob: (job: StatusJob) => void;
  updateJob: (id: string, text: string) => void;
  endJob: (id: string) => void;
  /** Shows a transient message for MESSAGE_MS, then the line returns to the job or "Ready" (D18). */
  showMessage: (text: string) => void;
}

let messageTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiStore = create<UiState>()((set) => ({
  visibleWidgets: [],
  settingsOpen: false,
  job: null,
  message: null,
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setVisibleWidgets: (visibleWidgets) => set({ visibleWidgets }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  startJob: (job) => set({ job }),
  updateJob: (id, text) => set((state) => (state.job?.id === id ? { job: { ...state.job, text } } : state)),
  endJob: (id) => set((state) => (state.job?.id === id ? { job: null } : state)),
  showMessage: (text) => {
    clearTimeout(messageTimer);
    set({ message: text });
    messageTimer = setTimeout(() => set({ message: null }), MESSAGE_MS);
  },
}));
