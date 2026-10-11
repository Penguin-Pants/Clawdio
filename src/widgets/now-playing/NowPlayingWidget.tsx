import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";

/** Now playing widget. P4 shows the playing song. */
export function NowPlayingWidget() {
  return (
    <div className="flex h-full items-center gap-3 p-2">
      <ArtPlaceholder className="size-16 shrink-0" />
      <p className="text-[13px] text-text-muted">Nothing playing</p>
    </div>
  );
}
