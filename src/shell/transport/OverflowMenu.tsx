import { useRef, useState } from "react";
import { IconButton } from "@/components/icon-button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { commands } from "@/lib/ipc/commands";
import { usePlayerStore } from "@/store/player";
import { useUiStore } from "@/store/ui";
import { focusLibrarySearch, setWidgetVisible } from "../layouts";
import { NEXT_REPEAT, REPEAT_LABELS } from "./PlayControls";
import { SeekBar } from "./SeekBar";
import type { SlotId } from "./slots";
import { send, usePlaybackEnabled } from "./use-current-song";
import { VolumeSlider } from "./VolumeControl";

type PopupSlot = "seek" | "volume";

/**
 * The "More" menu (TR-3, UD4): every slot that does not fit the band's size class, in slot
 * order. Seek and Volume open their slider in a popover at the More button.
 */
export function OverflowMenu({ slots }: { slots: SlotId[] }) {
  const enabled = usePlaybackEnabled();
  const player = usePlayerStore((state) => state.player);
  const queueShown = useUiStore((state) => state.visibleWidgets.includes("queue"));
  const [open, setOpen] = useState(false);
  const [popup, setPopup] = useState<PopupSlot | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  // The popover opens after the menu has closed and returned focus to the More button.
  const openPopup = (slot: PopupSlot) => requestAnimationFrame(() => setPopup(slot));
  const item = (id: SlotId) => {
    switch (id) {
      case "previous":
        return (
          <DropdownMenuItem key={id} disabled={!enabled} onClick={() => send(commands.playerPrevious)}>
            Previous
          </DropdownMenuItem>
        );
      case "next":
        return (
          <DropdownMenuItem key={id} disabled={!enabled} onClick={() => send(commands.playerNext)}>
            Next
          </DropdownMenuItem>
        );
      case "stop":
        return (
          <DropdownMenuItem key={id} disabled={!enabled} onClick={() => send(commands.playerStop)}>
            Stop
          </DropdownMenuItem>
        );
      case "shuffle":
        return (
          <DropdownMenuCheckboxItem
            key={id}
            checked={player.shuffle}
            disabled={!enabled}
            onCheckedChange={(on) => send(() => commands.playerSetShuffle(on))}
          >
            Shuffle
          </DropdownMenuCheckboxItem>
        );
      case "repeat":
        return (
          <DropdownMenuItem
            key={id}
            disabled={!enabled}
            onClick={() => send(() => commands.playerSetRepeat(NEXT_REPEAT[player.repeat]))}
          >
            Repeat: {REPEAT_LABELS[player.repeat]}
          </DropdownMenuItem>
        );
      case "queue":
        return (
          <DropdownMenuCheckboxItem
            key={id}
            checked={queueShown}
            onCheckedChange={(on) => setWidgetVisible("queue", on)}
          >
            Play queue
          </DropdownMenuCheckboxItem>
        );
      case "search":
        return (
          <DropdownMenuItem key={id} onClick={() => requestAnimationFrame(() => focusLibrarySearch())}>
            Search
            <DropdownMenuShortcut>Ctrl+F</DropdownMenuShortcut>
          </DropdownMenuItem>
        );
      case "seek":
        return (
          <DropdownMenuItem key={id} disabled={!enabled} onClick={() => openPopup("seek")}>
            Seek…
          </DropdownMenuItem>
        );
      case "volume":
        return (
          <DropdownMenuItem key={id} onClick={() => openPopup("volume")}>
            Volume…
          </DropdownMenuItem>
        );
      default:
        return null;
    }
  };
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger render={<IconButton ref={anchor} icon="more" label="More" size="icon" />} />
        <DropdownMenuContent align="end" className="w-48">
          {slots.map(item)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={popup !== null} onOpenChange={(next) => !next && setPopup(null)}>
        <PopoverContent anchor={anchor} align="end" className="w-64">
          {popup === "seek" && <SeekBar />}
          {popup === "volume" && <VolumeSlider />}
        </PopoverContent>
      </Popover>
    </>
  );
}
