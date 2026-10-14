import { commands } from "@/lib/ipc/commands";
import * as log from "@/lib/log";
import { type Density, useColumnsStore } from "@/store/columns";
import { type ColumnState, DEFAULT_COLUMNS, VIEW_IDS, type ViewId, parseColumnState } from "@/widgets/library/columns";

/** The `columns.json` version (UD13). */
export const COLUMNS_VERSION = 1;
/** A column change is saved this long after it, like the layout (P9.3). */
export const SAVE_DELAY_MS = 500;

export interface ColumnsFile {
  density: Density;
  views: Record<ViewId, ColumnState>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks `columns.json` (UD13): JSON, version 1 and a `views` object. A bad view part takes
 * its default and an unknown view key is ignored, each with a warning.
 */
export function parseColumnsFile(text: string): { file: ColumnsFile; warnings: string[] } | { reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { reason: "the columns file is not valid JSON" };
  }
  if (!isObject(value)) return { reason: "the columns file is not an object" };
  if (value.version !== COLUMNS_VERSION) return { reason: `unknown columns version ${String(value.version)}` };
  if (!isObject(value.views)) return { reason: "the columns file has no views" };
  const warnings: string[] = [];
  for (const key of Object.keys(value.views)) {
    if (!(VIEW_IDS as readonly string[]).includes(key)) warnings.push(`unknown view ${key} ignored`);
  }
  const views = { ...DEFAULT_COLUMNS };
  for (const view of VIEW_IDS) {
    const saved = value.views[view];
    if (saved === undefined) continue;
    const parsed = parseColumnState(saved, DEFAULT_COLUMNS[view]);
    if (parsed === null) {
      warnings.push(`invalid view ${view}; using the defaults`);
      continue;
    }
    views[view] = parsed.state;
    warnings.push(...parsed.warnings.map((warning) => `${view}: ${warning}`));
  }
  let density: Density = "regular";
  if (value.density === "regular" || value.density === "compact") density = value.density;
  else if (value.density !== undefined)
    warnings.push(`invalid density ${JSON.stringify(value.density)}; using regular`);
  return { file: { density, views }, warnings };
}

/**
 * Loads `columns.json` into the store. A file that fails is backed up as `columns.json.bak` with
 * one log line, and the defaults stay (PS-4). No file keeps the defaults.
 */
export async function restoreColumns(
  load: () => Promise<string | null> = () => commands.columnsLoad(),
  backup: () => Promise<void> = () => commands.columnsBackup(),
): Promise<void> {
  const before = useColumnsStore.getState();
  const text = await load().catch(() => null);
  if (text === null) return;
  // A sort, resize or density change during the load wins over the file: the user saw it.
  const { views, density } = useColumnsStore.getState();
  if (views !== before.views || density !== before.density) {
    log.info("columns: changed during the load; the saved columns were not applied");
    return;
  }
  const parsed = parseColumnsFile(text);
  if ("reason" in parsed) {
    log.warn(`columns: ${parsed.reason}; backed up as columns.json.bak; using the defaults`);
    await backup().catch((error: unknown) => log.warn(`columns: cannot back up: ${String(error)}`));
    return;
  }
  for (const warning of parsed.warnings) log.warn(`columns: ${warning}`);
  useColumnsStore.getState().setAll(parsed.file);
}

/** The object to save now. */
export function currentColumns(): ColumnsFile & { version: number } {
  const { density, views } = useColumnsStore.getState();
  return { version: COLUMNS_VERSION, density, views };
}

/** Saves 500 ms after each column change; `flush` writes at once for the close request (PS-3). */
export function watchColumns(save: (json: string) => Promise<void> = (json) => commands.columnsSave(json)): {
  flush: () => Promise<void>;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = false;
  const write = async (force: boolean) => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending && !force) return;
    pending = false;
    try {
      await save(JSON.stringify(currentColumns()));
    } catch (error) {
      log.warn(`columns: cannot save: ${String(error)}`);
    }
  };
  const stop = useColumnsStore.subscribe((state, previous) => {
    if (state.views === previous.views && state.density === previous.density) return;
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(() => void write(false), SAVE_DELAY_MS);
  });
  return {
    flush: () => write(true),
    dispose: () => {
      clearTimeout(timer);
      stop();
    },
  };
}
