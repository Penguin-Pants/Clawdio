import { error as logError, info as logInfo, warn as logWarn } from "@tauri-apps/plugin-log";

/** Writes an information line to the app log (R23). Outside the app shell it does nothing. */
export function info(message: string): void {
  logInfo(message).catch(() => {});
}

/** Writes a warning to the app log (R23). Outside the app shell it does nothing. */
export function warn(message: string): void {
  logWarn(message).catch(() => {});
}

/** Writes an error to the app log (R23). Outside the app shell it does nothing. */
export function error(message: string): void {
  logError(message).catch(() => {});
}
