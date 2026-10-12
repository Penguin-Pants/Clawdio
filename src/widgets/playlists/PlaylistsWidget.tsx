import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { VirtualList } from "@/components/virtual-list";
import { commands, type PlaylistEntry, type PlaylistRow } from "@/lib/ipc/commands";
import { useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { playlistEdit, usePlaylistsStore } from "@/store/playlists";
import { useUiStore } from "@/store/ui";
import { EmptyHint } from "../hint";
import { ROW_HEIGHT, Row, SongCells } from "../library/rows";
import { type RowMenuItem, useRowMenu } from "../row-menu";

type Line = { posinset: number; setsize: number } & (
  | { kind: "playlist"; playlist: PlaylistRow; expanded: boolean }
  | { kind: "entry"; playlist: number; index: number; entry: PlaylistEntry }
);

/** The tree as lines: each playlist, then the entries of open ones (P11.5). */
export function playlistLines(rows: PlaylistRow[], open: Set<number>, entries: Map<number, PlaylistEntry[]>): Line[] {
  const lines: Line[] = [];
  rows.forEach((playlist, position) => {
    const expanded = open.has(playlist.id);
    lines.push({ kind: "playlist", playlist, expanded, posinset: position + 1, setsize: rows.length });
    if (!expanded) return;
    const list = entries.get(playlist.id) ?? [];
    list.forEach((entry, index) =>
      lines.push({ kind: "entry", playlist: playlist.id, index, entry, posinset: index + 1, setsize: list.length }),
    );
  });
  return lines;
}

/**
 * The queue for a playlist (R6 queue rule): its library tracks in order, from entry `from`
 * (the next entry that is not missing). Missing entries are skipped.
 */
export function playlistQueue(entries: PlaylistEntry[], from = 0): { ids: number[]; start: number } | null {
  const ids: number[] = [];
  let start = -1;
  entries.forEach((entry, index) => {
    if (entry.track === null) return;
    if (start < 0 && index >= from) start = ids.length;
    ids.push(entry.track);
  });
  return start < 0 ? null : { ids, start };
}

async function play(id: number, from = 0) {
  const queue = playlistQueue(await commands.playlistEntries(id), from);
  if (queue) await commands.playerPlayList(queue.ids, queue.start);
}

function removeEntry(id: number, index: number) {
  void playlistEdit(() => commands.playlistRemoveEntry(id, index), "Cannot remove the entry");
}

type Selection = { playlist: number; entry: number | null } | null;

/**
 * Playlists widget (R12, P11.5): a tree of playlists in natural name order and their
 * entries. Up and Down move, Right opens, Left closes, Enter and double-click play, Delete
 * removes the selected entry (R25, D20).
 */
export function PlaylistsWidget() {
  const rows = usePlaylistsStore((state) => state.rows);
  const playlistsVersion = usePlaylistsStore((state) => state.version);
  const libraryVersion = useLibraryStore((state) => state.version);
  const openDialog = useUiStore((state) => state.openDialog);
  const [open, setOpen] = useState(() => new Set<number>());
  const [entries, setEntries] = useState(() => new Map<number, PlaylistEntry[]>());
  const [selection, setSelection] = useState<Selection>(null);
  const { row, request } = useSongRows(libraryVersion);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);

  // Open playlists load their entries, and again after each change.
  useEffect(() => {
    let active = true;
    for (const id of open) {
      commands.playlistEntries(id).then(
        (list) => active && setEntries((map) => new Map(map).set(id, list)),
        () => {},
      );
    }
    return () => {
      active = false;
    };
  }, [open, playlistsVersion]);

  const lines = useMemo(() => playlistLines(rows, open, entries), [rows, open, entries]);
  const active = lines.findIndex((line) =>
    selection === null
      ? false
      : line.kind === "playlist"
        ? selection.entry === null && line.playlist.id === selection.playlist
        : line.playlist === selection.playlist && line.index === selection.entry,
  );
  const select = (line: Line | undefined) =>
    setSelection(
      line === undefined
        ? null
        : line.kind === "playlist"
          ? { playlist: line.playlist.id, entry: null }
          : { playlist: line.playlist, entry: line.index },
    );
  const setExpanded = (id: number, expanded: boolean) =>
    setOpen((set) => {
      const next = new Set(set);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  const playLine = (line: Line) =>
    void (line.kind === "playlist" ? play(line.playlist.id) : play(line.playlist, line.index)).catch(() => {});
  const items = (line: Line): RowMenuItem[] =>
    line.kind === "playlist"
      ? [
          { label: "Play", run: () => playLine(line) },
          {
            label: "Delete playlist",
            run: () => openDialog({ kind: "deletePlaylist", id: line.playlist.id, fileName: line.playlist.fileName }),
          },
        ]
      : [
          { label: "Play", run: () => playLine(line) },
          {
            label: "Add to queue",
            run:
              line.entry.track === null
                ? undefined
                : () => {
                    const track = line.entry.track;
                    if (track !== null) void commands.queueAppend([track]).catch(() => {});
                  },
          },
          { label: "Remove from playlist", run: () => removeEntry(line.playlist, line.index) },
        ];
  const onRange = useCallback(
    (start: number, end: number) =>
      request(
        lines
          .slice(start, end + 1)
          .flatMap((line) => (line.kind === "entry" && line.entry.track !== null ? [line.entry.track] : [])),
      ),
    [lines, request],
  );
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const line = lines[active];
    if (menu.fromKey(event, line ? items(line) : null)) return;
    if (!line) return;
    if (event.key === "Enter") {
      event.preventDefault();
      playLine(line);
    } else if (event.key === "Delete" && line.kind === "entry") {
      event.preventDefault();
      removeEntry(line.playlist, line.index);
    } else if (event.key === "ArrowRight" && line.kind === "playlist") {
      event.preventDefault();
      if (!line.expanded) setExpanded(line.playlist.id, true);
      else if (lines[active + 1]?.kind === "entry") select(lines[active + 1]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (line.kind === "playlist") setExpanded(line.playlist.id, false);
      else setSelection({ playlist: line.playlist, entry: null });
    }
  };

  const header = (
    <div className="flex shrink-0 items-center gap-1 px-2 py-1">
      <Button variant="ghost" size="xs" onClick={() => openDialog({ kind: "newPlaylist" })}>
        New playlist
      </Button>
      {/* P12 wires Import. */}
      <Button variant="ghost" size="xs" disabled>
        Import playlist
      </Button>
    </div>
  );
  if (rows.length === 0) {
    return (
      <div className="flex size-full flex-col">
        {header}
        <EmptyHint>No playlists yet.</EmptyHint>
      </div>
    );
  }
  return (
    <div className="flex size-full flex-col">
      {header}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
        <VirtualList
          label="Playlists"
          role="tree"
          count={lines.length}
          rowHeight={ROW_HEIGHT}
          onRange={onRange}
          activeIndex={active >= 0 ? active : null}
          onMove={(index) => select(lines[index])}
          place={(index) => ({ posinset: lines[index].posinset, setsize: lines[index].setsize })}
          onKeyDown={onKeyDown}
          renderRow={(index, frame) => {
            const line = lines[index];
            if (line.kind === "playlist") {
              return (
                <Row
                  key={`p${line.playlist.id}`}
                  role="treeitem"
                  level={1}
                  expanded={line.expanded}
                  frame={frame}
                  selected={active === index}
                  onSelect={() => {
                    select(line);
                    setExpanded(line.playlist.id, !line.expanded);
                  }}
                  onPick={() => select(line)}
                  onActivate={() => playLine(line)}
                  onMenu={(anchor) => menu.open(anchor, items(line))}
                >
                  <span className="min-w-0 flex-1 truncate">{line.playlist.name}</span>
                  <span className="tabular text-xs text-text-muted">{line.playlist.entryCount}</span>
                </Row>
              );
            }
            return (
              <Row
                key={`e${line.playlist}-${line.index}`}
                role="treeitem"
                level={2}
                frame={frame}
                className="pl-7"
                selected={active === index}
                onSelect={() => select(line)}
                onActivate={() => playLine(line)}
                onMenu={(anchor) => menu.open(anchor, items(line))}
              >
                {line.entry.track === null ? (
                  <>
                    <Icon name="missing" className="text-text-muted" />
                    <span className="min-w-0 flex-1 truncate text-text-muted">{line.entry.label}</span>
                    <span className="text-xs text-text-muted">missing</span>
                  </>
                ) : (
                  <SongCells song={row(line.entry.track)} showAlbum={false} />
                )}
              </Row>
            );
          }}
        />
      </div>
      {menu.element}
    </div>
  );
}
