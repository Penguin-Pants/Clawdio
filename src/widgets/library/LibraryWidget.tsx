import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chooseMusicFolder } from "@/dialogs/SettingsDialog";
import { useSettingsStore } from "@/store/settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import { AlbumList, ArtistList, SongList, TreeList } from "./lists";

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

function SearchField() {
  const search = useLibraryStore((state) => state.search);
  const setSearch = useLibraryStore((state) => state.setSearch);
  return (
    <div className="relative min-w-0 flex-1">
      <Icon name="search" className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-text-muted" />
      <Input
        type="search"
        aria-label="Search"
        placeholder="Search"
        className="h-7 pl-7"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
    </div>
  );
}

/** A labeled list column. */
function ListFrame({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col border-border ${className ?? ""}`}>
      <div aria-hidden="true" className="px-2 py-1 text-[13px] text-text-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}

/** The mode-specific body (R28). */
function LibraryBody({ mode }: { mode: LibraryMode }) {
  if (mode === "tree") {
    return (
      <div data-library-body="tree" className="flex min-h-0 flex-1 flex-col">
        <TreeList />
      </div>
    );
  }
  const artistAndAlbum = (
    <>
      <ListFrame label="Artist" className="flex-1 border-r">
        <ArtistList />
      </ListFrame>
      <ListFrame label="Album" className={mode === "columns" ? "flex-1 border-r" : "flex-1"}>
        <AlbumList />
      </ListFrame>
    </>
  );
  if (mode === "columns") {
    return (
      <div data-library-body="columns" className="flex min-h-0 flex-1">
        {artistAndAlbum}
        <ListFrame label="Songs" className="flex-[2]">
          <SongList showAlbum />
        </ListFrame>
      </div>
    );
  }
  return (
    <div data-library-body="topBottom" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 border-b">{artistAndAlbum}</div>
      <ListFrame label="Songs" className="flex-1">
        <SongList showAlbum />
      </ListFrame>
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

/** Library widget (P2.8, R28): mode switch and search in its header. It cannot be hidden. */
export function LibraryWidget() {
  const mode = useLibraryStore((state) => state.mode);
  const folderState = useSettingsStore((state) => (state.loaded ? state.view.folderState : "ready"));
  const folderName = useSettingsStore((state) => state.view.folderName);
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < NARROW_WIDTH);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="flex size-full flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <ModeSwitch narrow={narrow} />
        <SearchField />
      </div>
      {folderState === "none" ? (
        <ChooseFolder />
      ) : folderState === "missing" ? (
        <FolderMissing name={folderName} />
      ) : (
        <LibraryBody mode={mode} />
      )}
    </div>
  );
}
