import { useState } from "react";
import { IconButton } from "@/components/icon-button";
import { Icon } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { commands } from "@/lib/ipc/commands";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/store/player";
import { send } from "./use-current-song";

/** The volume slider (R6). It sends each change at once; the drag value shows until commit. */
export function VolumeSlider({ className }: { className?: string }) {
  const volume = usePlayerStore((state) => state.player.volume);
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const value = dragVolume ?? volume;
  return (
    <div data-slot="volume" className={cn("flex items-center gap-2", className)}>
      <Icon name={value === 0 ? "volumeMuted" : "volume"} className="shrink-0 text-text-secondary" />
      <Slider
        label="Volume"
        className="w-24"
        min={0}
        max={100}
        step={1}
        largeStep={10}
        value={value}
        valueText={(next) => `Volume ${next} percent`}
        onValueChange={(next) => {
          setDragVolume(next);
          send(() => commands.playerSetVolume(next));
        }}
        onValueCommitted={() => setDragVolume(null)}
      />
    </div>
  );
}

/** At MD the volume slider becomes an icon button that opens it in a popover (UD4). */
export function VolumePopover() {
  const volume = usePlayerStore((state) => state.player.volume);
  return (
    <Popover>
      <PopoverTrigger
        render={<IconButton icon={volume === 0 ? "volumeMuted" : "volume"} label="Volume" size="icon" />}
      />
      <PopoverContent side="bottom" className="w-auto">
        <VolumeSlider />
      </PopoverContent>
    </Popover>
  );
}
