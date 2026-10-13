import type { CSSProperties } from "react";
import {
  AudioLines,
  Columns3,
  Ellipsis,
  FileX,
  GripVertical,
  Heart,
  ListMusic,
  ListTree,
  Menu,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Rows2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Semantic UI icon names (R31). Each name maps to a Lucide icon. A brand file
 * `assets/branding/ui-icons/<name>.svg` replaces the icon of that name at build time (P2.13).
 */
export const ICONS = {
  close: X,
  columns: Columns3,
  grip: GripVertical,
  heart: Heart,
  missing: FileX,
  menu: Menu,
  more: Ellipsis,
  next: SkipForward,
  pause: Pause,
  play: Play,
  playing: AudioLines,
  previous: SkipBack,
  queue: ListMusic,
  repeat: Repeat,
  repeatOne: Repeat1,
  search: Search,
  shuffle: Shuffle,
  stop: Square,
  topBottom: Rows2,
  tree: ListTree,
  volume: Volume2,
  volumeMuted: VolumeX,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Override URLs keyed by icon name. */
export type IconOverrides = Partial<Record<IconName, string>>;

/** Maps file paths from `import.meta.glob` to icon names. Files with unknown names are ignored. */
export function overridesFromFiles(files: Record<string, string>): IconOverrides {
  const overrides: IconOverrides = {};
  for (const [path, url] of Object.entries(files)) {
    const name = path.replace(/^.*\//, "").replace(/\.svg$/, "");
    if (name in ICONS) overrides[name as IconName] = url;
  }
  return overrides;
}

const BUILD_OVERRIDES = overridesFromFiles(
  import.meta.glob<string>("../../assets/branding/ui-icons/*.svg", { eager: true, query: "?url", import: "default" }),
);

interface IconProps {
  name: IconName;
  className?: string;
  /** Override map, for tests. The build map is the default. */
  overrides?: IconOverrides;
}

/**
 * A decorative UI icon in `currentColor`. An override renders through a CSS mask, so it
 * takes the text color like a Lucide icon. Controls carry the accessible name, not the icon.
 */
export function Icon({ name, className, overrides = BUILD_OVERRIDES }: IconProps) {
  const url = overrides[name];
  if (url) {
    const mask: CSSProperties = { maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` };
    return (
      <span
        aria-hidden="true"
        data-slot="mask-icon"
        data-icon={name}
        className={cn("inline-block size-4 shrink-0 bg-current mask-contain mask-center mask-no-repeat", className)}
        style={mask}
      />
    );
  }
  const Lucide = ICONS[name];
  return <Lucide aria-hidden="true" data-icon={name} className={cn("size-4 shrink-0", className)} />;
}
