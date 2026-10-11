import { useEffect, useState } from "react";
import { commands, type PlaylistEntry, type PlaylistRow } from "@/lib/ipc/commands";
import { useCommand, useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { cn } from "@/lib/utils";
import { EmptyHint } from "../hint";

const NO_PLAYLISTS: PlaylistRow[] = [];

function Entries({ id }: { id: number }) {
  const entries = useCommand<PlaylistEntry[]>(() => commands.playlistEntries(id), [], [id]);
  const version = useLibraryStore((state) => state.version);
  const { row, request } = useSongRows(version);
  useEffect(() => {
    request(entries.flatMap((entry) => (entry.track === null ? [] : [entry.track])));
  }, [entries, request]);
  return (
    <div role="group">
      {entries.map((entry, index) => {
        const song = entry.track === null ? undefined : row(entry.track);
        return (
          <div
            key={index}
            role="treeitem"
            aria-level={2}
            aria-selected={false}
            className="flex h-7 items-center gap-2 pr-2 pl-7 text-sm whitespace-nowrap"
          >
            {entry.track === null ? (
              <>
                <span className="min-w-0 flex-1 truncate text-text-muted">{entry.label}</span>
                <span className="text-xs text-text-muted">missing</span>
              </>
            ) : (
              <span className="min-w-0 flex-1 truncate">{song?.title ?? "…"}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Playlists widget (R12): playlists that expand to show their songs. P11 adds editing. */
export function PlaylistsWidget() {
  const playlists = useCommand(() => commands.playlistsList(), NO_PLAYLISTS, []);
  const [open, setOpen] = useState<number | null>(null);
  if (playlists.length === 0) return <EmptyHint>No playlists yet.</EmptyHint>;
  return (
    <div
      role="tree"
      aria-label="Playlists"
      tabIndex={0}
      className="size-full overflow-auto focus-visible:-outline-offset-2"
    >
      {playlists.map((playlist) => (
        <div key={playlist.id}>
          <div
            role="treeitem"
            aria-level={1}
            aria-expanded={open === playlist.id}
            aria-selected={false}
            onClick={() => setOpen(open === playlist.id ? null : playlist.id)}
            className={cn("flex h-7 cursor-default items-center gap-2 px-2 text-sm hover:bg-bg-hover")}
          >
            <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
            <span className="tabular text-xs text-text-muted">{playlist.entryCount}</span>
          </div>
          {open === playlist.id && <Entries id={playlist.id} />}
        </div>
      ))}
    </div>
  );
}
