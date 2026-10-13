import { ArtPlaceholder } from "@/components/brand/ArtPlaceholder";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAlbumArt } from "@/lib/art";
import { thumbUrl } from "@/lib/thumbs";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { setMiniPlayer } from "../mini";
import { useCurrentSong } from "./use-current-song";

/**
 * The compact now-playing display of the band (TR-5): art, title and artist, each line with
 * an ellipsis. The art is the 96 px thumbnail (D41). `art` is false at SM and XS (UD4). The art is
 * the mini player button (TR-9, UD19).
 */
export function NowPlayingDisplay({ art = true, className }: { art?: boolean; className?: string }) {
  const song = useCurrentSong();
  const src = useAlbumArt(song?.albumId ?? null, 96);
  return (
    <div data-slot="now-playing" className={cn("flex min-w-0 items-center gap-2", className)}>
      {art && <MiniButton src={src} />}
      {song ? (
        <div className="flex min-w-0 flex-col leading-tight">
          <span data-slot="title" className="truncate text-sm">
            {song.title}
          </span>
          <span data-slot="artist" className="truncate text-[13px] text-text-secondary">
            {song.artistName}
          </span>
        </div>
      ) : (
        <span className="truncate text-xs text-text-muted">Nothing playing</span>
      )}
    </div>
  );
}

/** The band art: a click enters the mini player, and leaves it again (UD19). */
function MiniButton({ src }: { src: string | null }) {
  const mini = useUiStore((state) => state.mini);
  const label = mini ? "Exit mini player" : "Mini player";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            aria-label={label}
            className="size-10 shrink-0 overflow-hidden rounded-card p-0"
            onClick={() => setMiniPlayer(!mini)}
          />
        }
      >
        {src ? (
          <img src={thumbUrl(src)} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <ArtPlaceholder className="size-full" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
