import { useCallback } from "react";
import { VirtualList } from "@/components/virtual-list";
import { useSongRows } from "@/lib/ipc/hooks";
import { usePlayerStore } from "@/store/player";
import { ROW_HEIGHT, Row, SongCells } from "../library/rows";
import { EmptyHint } from "../hint";

/** Play queue widget (R6). The current entry is marked with a label. P7 adds editing. */
export function QueueWidget() {
  const queue = usePlayerStore((state) => state.queue);
  const { row, request } = useSongRows();
  const onRange = useCallback(
    (start: number, end: number) => request(queue.entries.slice(start, end + 1)),
    [queue.entries, request],
  );
  if (queue.entries.length === 0) return <EmptyHint>The queue is empty. Double-click a song to play it.</EmptyHint>;
  return (
    <div className="flex size-full flex-col">
      <VirtualList
        label="Play queue"
        role="listbox"
        count={queue.entries.length}
        rowHeight={ROW_HEIGHT}
        onRange={onRange}
        renderRow={(index, frame) => (
          <Row key={index} frame={frame} selected={false}>
            {index === queue.current && <span className="sr-only">Playing: </span>}
            <span aria-hidden="true" className="w-4 text-xs text-text-muted">
              {index === queue.current ? "▶" : ""}
            </span>
            <SongCells song={row(queue.entries[index])} showAlbum={false} />
          </Row>
        )}
      />
    </div>
  );
}
