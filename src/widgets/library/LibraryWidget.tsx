import { Orientation } from "dockview-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chooseMusicFolder } from "@/dialogs/SettingsDialog";
import { observeSize } from "@/lib/resize";
import { focusLibrarySearch } from "@/shell/layouts";
import { useSettingsStore } from "@/store/settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import type { ViewId } from "./columns";
import { FrameSplit } from "./FrameSplit";
import { AlbumList, ArtistList, SongTable, TreeList } from "./lists";
import { PlaylistView } from "./PlaylistView";

/** Below this widget width the mode switch becomes a dropdown (R28). */
export const NARROW_WIDTH = 360;

export const MODE_LABELS: Record<LibraryMode, string> = {
  tree: "Tree",
  columns: "Columns",
  topBottom: "Top/bottom",
};

const MODE_ICONS: Record<LibraryMode, IconName> = { tree: "tree", columns: "columns", topBottom: "topBottom" };

function isLibraryMode(value: unknown): value is LibraryMode {
  return typeof value === "string" && (LIBRARY_MODES as readonly string[]).includes(value);
}

function ModeSwitch({ narrow }: { narrow: boolean }) {
  const mode = useLibraryStore((state) => state.mode);
  const setMode = useLibraryStore((state) => state.setMode);
  if (narrow) {
    return (
      <Select
        items={MODE_LABELS}
        value={mode}
        onValueChange={(value) => {
          if (isLibraryMode(value)) setMode(value);
        }}
      >
        <SelectTrigger size="sm" aria-label="Library mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LIBRARY_MODES.map((value) => (
            <SelectItem key={value} value={value}>
              <Icon name={MODE_ICONS[value]} />
              {MODE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <ToggleGroup
      aria-label="Library mode"
      size="sm"
      spacing={1}
      value={[mode]}
      onValueChange={(values) => {
        const next = values[0];
        if (isLibraryMode(next)) setMode(next);
      }}
    >
      {LIBRARY_MODES.map((value) => (
        <ToggleGroupItem key={value} value={value}>
          <Icon name={MODE_ICONS[value]} />
          {MODE_LABELS[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Search waits this long after the last key (P6.2). */
export const SEARCH_DEBOUNCE_MS = 120;

/** Focuses the first list of the Library body. */
function focusLibraryList(from: HTMLElement) {
  from
    .closest('[data-widget="library"]')
    ?.querySelector<HTMLElement>(
      '[data-library-body] [role="listbox"], [data-library-body] [role="tree"], [data-library-body] [role="grid"]',
    )
    ?.focus();
}

/** The search field (R6): it searches as the user types, 120 ms after the last key. Esc clears it. */
function SearchField() {
  const search = useLibraryStore((state) => state.search);
  const setSearch = useLibraryStore((state) => state.setSearch);
  const [text, setText] = useState(search);
  const sent = useRef(search);
  // A change from elsewhere shows in the field; the field's own changes come back unchanged.
  useEffect(() => {
    if (search !== sent.current) {
      sent.current = search;
      setText(search);
    }
  }, [search]);
  useEffect(() => {
    if (text === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = text;
      setSearch(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, setSearch]);
  return (
    <div className="relative min-w-0 flex-1">
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-muted" />
      <Input
        type="search"
        aria-label="Search"
        placeholder="Search"
        className="h-7 pl-7"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          setText("");
          sent.current = "";
          setSearch("");
          focusLibraryList(event.currentTarget);
        }}
      />
    </div>
  );
}

/** A labeled list column. */
function ListFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex size-full min-h-0 min-w-0 flex-col">
      <div aria-hidden="true" data-frame-label="" className="px-2 py-1 text-[13px] text-text-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}

const ARTIST_FRAME = {
  id: "artist",
  content: (
    <ListFrame label="Artist">
      <ArtistList />
    </ListFrame>
  ),
};
const ALBUM_FRAME = {
  id: "album",
  content: (
    <ListFrame label="Album">
      <AlbumList />
    </ListFrame>
  ),
};
/** The Songs frame of a mode: the table with that mode's column state (TB-9, UD8). */
const songsFrame = (view: ViewId) => ({
  id: "songs",
  content: (
    <ListFrame label="Songs">
      <SongTable view={view} />
    </ListFrame>
  ),
});
const COLUMNS_SONGS = songsFrame("songs.columns");
const TOP_BOTTOM_SONGS = songsFrame("songs.topBottom");
const TOP_ROW_FRAME = {
  id: "top",
  content: (
    <div className="flex size-full">
      <FrameSplit group="top" orientation={Orientation.HORIZONTAL} views={[ARTIST_FRAME, ALBUM_FRAME]} />
    </div>
  ),
};

/** The mode-specific body (R28). Columns and Top/bottom frames have splitters (R28.1). */
function LibraryBody({ mode }: { mode: LibraryMode }) {
  if (mode === "tree") {
    return (
      <div data-library-body="tree" className="flex min-h-0 flex-1 flex-col">
        <TreeList />
      </div>
    );
  }
  if (mode === "columns") {
    return (
      // Each mode keys its body, so a mode switch builds a new splitview (R28.1).
      <div key="columns" data-library-body="columns" className="flex min-h-0 flex-1">
        <FrameSplit
          group="columns"
          orientation={Orientation.HORIZONTAL}
          views={[ARTIST_FRAME, ALBUM_FRAME, COLUMNS_SONGS]}
        />
      </div>
    );
  }
  return (
    <div key="topBottom" data-library-body="topBottom" className="flex min-h-0 flex-1 flex-col">
      <FrameSplit group="rows" orientation={Orientation.VERTICAL} views={[TOP_ROW_FRAME, TOP_BOTTOM_SONGS]} />
    </div>
  );
}

/** First run with no music folder (R1.1, P4.6). */
function ChooseFolder() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-2xl">Choose your music folder</h2>
      <p className="max-w-sm text-sm text-text-secondary">
        The app shows the songs in one folder. It reads the folder and never changes your audio files.
      </p>
      <Button onClick={chooseMusicFolder}>Choose music folder</Button>
    </div>
  );
}

/** The music folder is missing at startup (D30, P5.10): the cached library does not show. */
function FolderMissing({ name }: { name: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h2 className="text-2xl">Music folder not found{name ? `: ${name}` : ""}</h2>
      <p className="max-w-sm text-sm text-text-secondary">Connect the drive that holds it, or choose another folder.</p>
      <Button onClick={chooseMusicFolder}>Change folder</Button>
    </div>
  );
}

/**
 * Library widget (P2.8, R28): mode switch and search in its header. It cannot be hidden. A
 * playlist picked in the Playlists widget takes the place of the lists, with a way back (R12 v1.9).
 */
export function LibraryWidget() {
  const mode = useLibraryStore((state) => state.mode);
  const playlist = useLibraryStore((state) => state.playlist);
  const folderState = useSettingsStore((state) => (state.loaded ? state.view.folderState : "ready"));
  const folderName = useSettingsStore((state) => state.view.folderName);
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Once per frame of resizes (PF-2, UD24).
    return observeSize(element, (entry) => setNarrow(entry.contentRect.width < NARROW_WIDTH));
  }, []);
  return (
    <div ref={ref} className="flex size-full flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        {playlist !== null && folderState === "ready" ? (
          // Back to the lists, with the focus in the search field (AX-1).
          <Button variant="ghost" size="sm" onClick={() => focusLibrarySearch()}>
            <Icon name="back" />
            Library
          </Button>
        ) : (
          <>
            <ModeSwitch narrow={narrow} />
            <SearchField />
          </>
        )}
      </div>
      {folderState === "none" ? (
        <ChooseFolder />
      ) : folderState === "missing" ? (
        <FolderMissing name={folderName} />
      ) : playlist !== null ? (
        <PlaylistView key={playlist} id={playlist} />
      ) : (
        <LibraryBody mode={mode} />
      )}
    </div>
  );
}
