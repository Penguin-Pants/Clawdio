import { create } from "zustand";
import type { ImportBatch, MetadataPreview, RepairBatch } from "@/lib/ipc/commands";
import { DEFAULT_SLOTS, type TransportSlots } from "@/shell/transport/slots";

/** How long a transient status message shows (D18). */
export const MESSAGE_MS = 5000;

/** The app's small dialogs: a new playlist name, a delete confirmation, an error (P11), the
 * import report (P12, R32), the repair report (R33.5), the metadata preview (P16) and Customize
 * transport bar (UD20). */
export type AppDialog =
  | { kind: "newPlaylist"; addTracks?: number[] }
  | { kind: "deletePlaylist"; id: number; fileName: string }
  | { kind: "error"; text: string }
  | { kind: "importReport"; batch: ImportBatch }
  | { kind: "repairReport"; batch: RepairBatch }
  | { kind: "metadataPreview"; album: number; preview: MetadataPreview }
  | { kind: "customizeTransport" };

/** A running job in the status line (R5). `cancel` is absent when the job cannot be canceled. */
export interface StatusJob {
  id: string;
  text: string;
  cancel?: () => void;
}

interface UiState {
  /** Lock layout (R38.9), saved in `layout.json`. Unlocked on a fresh install. */
  locked: boolean;
  /** The band slot order and hidden set (UD20, TR-10), saved in `layout.json`. */
  transportSlots: TransportSlots;
  /** Mini player mode (UD19, TR-9): the window shows the band only. Not saved. */
  mini: boolean;
  setLocked: (locked: boolean) => void;
  setTransportSlots: (slots: TransportSlots) => void;
  setMini: (mini: boolean) => void;
  settingsOpen: boolean;
  /** Running jobs, oldest first. */
  jobs: StatusJob[];
  /** The job the status line shows: the newest running one (R5). */
  job: StatusJob | null;
  message: string | null;
  dialog: AppDialog | null;
  openDialog: (dialog: AppDialog) => void;
  closeDialog: () => void;
  setSettingsOpen: (open: boolean) => void;
  startJob: (job: StatusJob) => void;
  updateJob: (id: string, text: string) => void;
  endJob: (id: string) => void;
  hasJob: (id: string) => boolean;
  /** Shows a transient message for MESSAGE_MS, then the line returns to the job or "Ready" (D18). */
  showMessage: (text: string) => void;
}

let messageTimer: ReturnType<typeof setTimeout> | undefined;

/** The jobs and the one the status line shows. */
const withJobs = (jobs: StatusJob[]) => ({ jobs, job: jobs.at(-1) ?? null });

export const useUiStore = create<UiState>()((set, get) => ({
  locked: false,
  transportSlots: DEFAULT_SLOTS,
  mini: false,
  setLocked: (locked) => set({ locked }),
  setTransportSlots: (transportSlots) => set({ transportSlots }),
  setMini: (mini) => set({ mini }),
  settingsOpen: false,
  jobs: [],
  job: null,
  message: null,
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  startJob: (job) => set((state) => withJobs([...state.jobs.filter((other) => other.id !== job.id), job])),
  updateJob: (id, text) =>
    set((state) =>
      state.jobs.some((job) => job.id === id)
        ? withJobs(state.jobs.map((job) => (job.id === id ? { ...job, text } : job)))
        : state,
    ),
  endJob: (id) =>
    set((state) =>
      state.jobs.some((job) => job.id === id) ? withJobs(state.jobs.filter((job) => job.id !== id)) : state,
    ),
  hasJob: (id) => get().jobs.some((job) => job.id === id),
  showMessage: (text) => {
    clearTimeout(messageTimer);
    set({ message: text });
    messageTimer = setTimeout(() => set({ message: null }), MESSAGE_MS);
  },
}));
