import { getName } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

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

/**
 * The app name from the build config (`productName`, D2). It is empty until the name is read,
 * and stays empty outside the app shell.
 */
export function useAppName(readName: () => Promise<string> = getName): string {
  const [name, setName] = useState("");
  useEffect(() => {
    let active = true;
    readName().then(
      (value) => {
        if (active) setName(value);
      },
      () => {
        // No Tauri runtime: keep the empty name.
      },
    );
    return () => {
      active = false;
    };
  }, [readName]);
  return name;
}
