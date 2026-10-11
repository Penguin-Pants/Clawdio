import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * The URL of a thumbnail by its file name. The `thumb://` scheme resolves the name inside the
 * thumbnail folder, so the webview never sees a path (D13, D41).
 */
export function thumbUrl(name: string): string {
  return convertFileSrc(name, "thumb");
}
