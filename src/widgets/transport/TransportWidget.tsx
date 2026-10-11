import { IconButton } from "@/components/icon-button";
import type { IconName } from "@/components/icons";

const BUTTONS: { icon: IconName; label: string }[] = [
  { icon: "shuffle", label: "Shuffle" },
  { icon: "previous", label: "Previous" },
  { icon: "play", label: "Play" },
  { icon: "stop", label: "Stop" },
  { icon: "next", label: "Next" },
  { icon: "repeat", label: "Repeat" },
];

/** Transport controls. The buttons stay disabled until P4 and P7 wire them. */
export function TransportWidget() {
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-2">
      <div className="flex items-center justify-center gap-1">
        {BUTTONS.map(({ icon, label }) => (
          <IconButton key={icon} icon={icon} label={label} disabled />
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span data-slot="time" className="tabular">
          0:00
        </span>
        <div data-slot="seek-track" aria-hidden="true" className="h-1 flex-1 rounded-full bg-brand-steel" />
        <span data-slot="time" className="tabular">
          0:00
        </span>
      </div>
    </div>
  );
}
