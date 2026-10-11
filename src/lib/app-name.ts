import { getName } from "@tauri-apps/api/app";

/**
 * Sets the document title to the app name from the build config (`productName`, D2).
 * Outside the app shell the name cannot be read, so the title stays as it is.
 */
export async function applyAppName(readName: () => Promise<string> = getName, doc: Document = document): Promise<void> {
  try {
    doc.title = await readName();
  } catch {
    // No Tauri runtime (for example a plain browser). The window title is set natively.
  }
}
