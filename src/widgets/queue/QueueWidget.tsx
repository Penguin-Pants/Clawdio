import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { VirtualList } from "@/components/virtual-list";
import { commands } from "@/lib/ipc/commands";
import { useSongRows } from "@/lib/ipc/hooks";
import { useLibraryStore } from "@/store/library";
import { usePlayerStore } from "@/store/player";
import { Row, SongCells, useRowHeight } from "../library/rows";
import { EmptyHint } from "../hint";
import { useRowMenu } from "../row-menu";

/** Removes queue entry `index` (R6 queue edits). Events bring the new queue. */
function removeEntry(index: number) {
  void commands.queueRemove(index).catch(() => {});
}

/**
 * Play queue widget (R6, P7.9): the queue in order with the current entry marked, Up and Down
 * select, Delete removes the selected entry (R25), a context menu with Remove, and Clear queue.
 */
export function QueueWidget() {
  const rowHeight = useRowHeight();
  const queue = usePlayerStore((state) => state.queue);
  const version = useLibraryStore((state) => state.version);
  const { row, request } = useSongRows(version);
  // Entries can repeat a track, so the selection is an index.
  const [selected, setSelected] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menu = useRowMenu(listRef);
  const count = queue.entries.length;
  const active = selected !== null && count > 0 ? Math.min(selected, count - 1) : null;
  const onRange = useCallback(
    (start: number, end: number) => request(queue.entries.slice(start, end + 1)),
    [queue.entries, request],
  );
  if (count === 0) {
    return (
      // An empty queue takes a row drag too (TB-12).
      <div data-drop-target="queue" className="size-full">
        <EmptyHint>The queue is empty. Double-click a song to play it.</EmptyHint>
      </div>
    );
  }
  const items = (index: number) => [{ label: "Remove", run: () => removeEntry(index) }];
  return (
    // The whole widget takes a row drag of songs (TB-12, UD21).
    <div data-drop-target="queue" className="flex size-full flex-col">
      <div className="flex shrink-0 items-center justify-between px-2 py-1 text-[13px] text-text-secondary">
        <span>{count === 1 ? "1 song" : `${count} songs`}</span>
        <Button variant="ghost" size="xs" onClick={() => void commands.queueClear().catch(() => {})}>
          Clear queue
        </Button>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col">
        <VirtualList
          label="Play queue"
          role="listbox"
          count={count}
          rowHeight={rowHeight}
          onRange={onRange}
          activeIndex={active}
          onMove={setSelected}
          onKeyDown={(event) => {
            if (menu.fromKey(event, active === null ? null : items(active))) return;
            if (event.key === "Delete" && active !== null) {
              event.preventDefault();
              removeEntry(active);
            }
          }}
          renderRow={(index, frame) => (
            <Row
              key={index}
              frame={frame}
              selected={active === index}
              onSelect={() => setSelected(index)}
              onMenu={(anchor) => menu.open(anchor, items(index))}
            >
              <SongCells song={row(queue.entries[index])} showAlbum={false} playing={index === queue.current} />
            </Row>
          )}
        />
      </div>
      {menu.element}
    </div>
  );
}
