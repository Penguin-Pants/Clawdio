import { error as logError, warn as logWarn } from "@tauri-apps/plugin-log";

/** Writes a warning to the app log (R23). Outside the app shell it does nothing. */
export function warn(message: string): void {
  logWarn(message).catch(() => {});
}

/** Writes an error to the app log (R23). Outside the app shell it does nothing. */
export function error(message: string): void {
  logError(message).catch(() => {});
}
