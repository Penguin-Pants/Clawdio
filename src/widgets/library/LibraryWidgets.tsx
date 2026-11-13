import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chooseMusicFolder } from "@/dialogs/SettingsDialog";
import { focusLibrarySearch, useGridStore } from "@/shell/layouts";
import { useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { AlbumList, ArtistList, SongTable, TreeList } from "./lists";
import { PlaylistView } from "./PlaylistView";

/** Search waits this long after the last key (P6.2). */
export const SEARCH_DEBOUNCE_MS = 120;

/** Focuses the first shown Library list: Artist, then Tree, Album and Songs (as the old Library body). */
function focusLibraryList(doc: Document) {
  const lists = '[role="listbox"], [role="tree"], [role="grid"]';
  for (const id of ["artist", "tree", "album", "songs"]) {
    const list = doc.querySelector<HTMLElement>(`[data-widget="${id}"] :is(${lists})`);
    if (list) {
      list.focus();
      return;
    }
  }
}

/**
 * The Search widget (R6, R38.3): it filters Artist, Album, Songs and Tree as the user types,
 * 120 ms after the last key. Esc clears it and goes to the song list.
 */
export function SearchWidget() {
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
    <div className="flex size-full items-center px-2">
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
            focusLibraryList(event.currentTarget.ownerDocument);
          }}
        />
      </div>
    </div>
  );
}

/** A list body that fills its widget below the header. */
function ListBody({ children }: { children: ReactNode }) {
  return <div className="flex size-full min-h-0 min-w-0 flex-col">{children}</div>;
}

/** The Artist widget (R38.3): an "All" row, then the artists the search finds. */
export function ArtistWidget() {
  return (
    <ListBody>
      <ArtistList />
    </ListBody>
  );
}

/** The Album widget (R38.3): an Artist selection filters it. */
export function AlbumWidget() {
  return (
    <ListBody>
      <AlbumList />
    </ListBody>
  );
}

/** The Tree widget (R38.3): a Tree selection filters Songs as an Album selection does. */
export function TreeWidget() {
  return (
    <ListBody>
      <TreeList />
    </ListBody>
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
 * The Songs widget (R38.3): the song table, or the folder prompts, or a playlist picked in the
 * Playlists widget with a way back to the library (R12 v1.9). It cannot be hidden (R38.7).
 */
export function SongsWidget() {
  const playlist = useLibraryStore((state) => state.playlist);
  const showPlaylist = useLibraryStore((state) => state.showPlaylist);
  const folderState = useSettingsStore((state) => (state.loaded ? state.view.folderState : "ready"));
  const folderName = useSettingsStore((state) => state.view.folderName);
  const ref = useRef<HTMLDivElement>(null);
  if (folderState === "none") return <ChooseFolder />;
  if (folderState === "missing") return <FolderMissing name={folderName} />;
  if (playlist === null) {
    return (
      <ListBody>
        <SongTable view="songs.columns" />
      </ListBody>
    );
  }
  return (
    <div ref={ref} className="flex size-full min-h-0 flex-col">
      <div className="flex items-center border-b px-2 py-1">
        {/* Back to the library songs, with the focus in the search field, else the table (AX-1). */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const doc = ref.current?.ownerDocument ?? document;
            if (useGridStore.getState().layout.search) {
              focusLibrarySearch(doc);
              return;
            }
            showPlaylist(null);
            requestAnimationFrame(() => focusLibraryList(doc));
          }}
        >
          <Icon name="back" />
          Library
        </Button>
      </div>
      <PlaylistView key={playlist} id={playlist} />
    </div>
  );
}
