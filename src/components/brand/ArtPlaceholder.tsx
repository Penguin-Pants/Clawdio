import type { CSSProperties } from "react";
import monogramUrl from "../../../assets/branding/source/clawdio-monogram.svg";
import { cn } from "@/lib/utils";

const monogramMask: CSSProperties = {
  maskImage: `url("${monogramUrl}")`,
  WebkitMaskImage: `url("${monogramUrl}")`,
};

/**
 * Quiet art placeholder (P1.8, design.md section 5): a square on the elevated surface with the
 * monogram (60 % of the square, centered) drawn by a CSS mask in the muted text color. It is decorative.
 */
export function ArtPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("grid aspect-square place-items-center rounded-card bg-bg-elevated", className)}
    >
      <div
        data-slot="art-placeholder-mark"
        className="size-3/5 bg-text-muted mask-contain mask-center mask-no-repeat"
        style={monogramMask}
      />
    </div>
  );
}
