import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { IconButton } from "@/components/icon-button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SLOTS,
  type SlotId,
  canHide,
  canMove,
  moveSlot,
  moveSlotTo,
  setSlotHidden,
} from "@/shell/transport/slots";
import { useUiStore } from "@/store/ui";

/** The slot names in the dialog (UD20). */
export const SLOT_LABELS: Record<SlotId, string> = {
  previous: "Previous",
  playPause: "Play or pause",
  next: "Next",
  nowPlaying: "Now playing",
  seek: "Seek bar",
  stop: "Stop",
  shuffle: "Shuffle",
  repeat: "Repeat",
  volume: "Volume",
  queue: "Play queue",
  search: "Search",
};

/**
 * Customize transport bar (TR-10, UD20): a checkbox per optional slot, Move up and Move down, and
 * a drag handle per movable slot. Previous, play or pause and next stay first; play or pause cannot
 * hide. Each change applies to the band at once and saves with the layout.
 */
export function CustomizeTransportDialog() {
  const slots = useUiStore((state) => state.transportSlots);
  const setSlots = useUiStore((state) => state.setTransportSlots);
  const close = useUiStore((state) => state.closeDialog);
  const listRef = useRef<HTMLUListElement>(null);
  /** The slot under a pointer drag and the index it would drop at. */
  const [drag, setDrag] = useState<{ id: SlotId; index: number } | null>(null);

  /** Pointer drag of a handle (UD10, no HTML5 drag): the row under the pointer is the target. */
  const startDrag = (event: React.PointerEvent<HTMLSpanElement>, id: SlotId) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const indexAt = (y: number) => {
      const rows = [...(listRef.current?.children ?? [])].map((row) => row.getBoundingClientRect());
      const index = rows.findIndex((box) => y < box.top + box.height / 2);
      return index === -1 ? rows.length - 1 : index;
    };
    setDrag({ id, index: slots.order.indexOf(id) });
    const move = (moveEvent: PointerEvent) => setDrag({ id, index: indexAt(moveEvent.clientY) });
    const end = (endEvent: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDrag(null);
      if (endEvent.type === "pointerup") {
        const current = useUiStore.getState().transportSlots;
        setSlots(moveSlotTo(current, id, indexAt(endEvent.clientY)));
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Customize transport bar</DialogTitle>
        <DialogDescription>
          Show or hide controls and change their order. Controls that do not fit move to the More menu.
        </DialogDescription>
      </DialogHeader>
      <ul ref={listRef} aria-label="Transport bar slots" className="flex flex-col gap-0.5">
        {slots.order.map((id, index) => {
          const label = SLOT_LABELS[id];
          const movable = canMove(id);
          return (
            <li
              key={id}
              data-slot={id}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-1 text-sm",
                drag?.id === id && "bg-bg-hover",
                drag !== null &&
                  drag.id !== id &&
                  drag.index === index &&
                  "shadow-[inset_0_2px_0_var(--color-brand-red)]",
              )}
            >
              {movable ? (
                <span
                  aria-hidden="true"
                  data-slot="slot-handle"
                  onPointerDown={(event) => startDrag(event, id)}
                  className="flex size-6 cursor-grab touch-none items-center justify-center text-text-muted"
                >
                  <Icon name="grip" />
                </span>
              ) : (
                <span aria-hidden="true" className="size-6" />
              )}
              {canHide(id) ? (
                <input
                  id={`slot-${id}`}
                  type="checkbox"
                  aria-label={`Show ${label}`}
                  checked={!slots.hidden.includes(id)}
                  onChange={(event) => setSlots(setSlotHidden(slots, id, !event.target.checked))}
                  className="size-4 accent-brand-red"
                />
              ) : (
                <span aria-hidden="true" className="size-4" />
              )}
              <label htmlFor={canHide(id) ? `slot-${id}` : undefined} className="flex-1 truncate">
                {label}
                {!canHide(id) && <span className="text-text-muted"> (always shown)</span>}
              </label>
              {movable && (
                <>
                  <IconButton
                    icon="chevronUp"
                    label={`Move ${label} up`}
                    disabled={moveSlot(slots, id, -1) === slots}
                    onClick={() => setSlots(moveSlot(slots, id, -1))}
                  />
                  <IconButton
                    icon="chevronDown"
                    label={`Move ${label} down`}
                    disabled={moveSlot(slots, id, 1) === slots}
                    onClick={() => setSlots(moveSlot(slots, id, 1))}
                  />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <Button variant="outline" onClick={() => setSlots(DEFAULT_SLOTS)}>
          Reset to default
        </Button>
        <Button onClick={close}>Done</Button>
      </DialogFooter>
    </>
  );
}
