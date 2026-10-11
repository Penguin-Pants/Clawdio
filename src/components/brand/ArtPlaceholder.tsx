import type { CSSProperties } from "react";
import monogramUrl from "../../../assets/branding/source/clawdio-monogram.svg";
import { cn } from "@/lib/utils";

const monogramMask: CSSProperties = {
  maskImage: `url("${monogramUrl}")`,
  WebkitMaskImage: `url("${monogramUrl}")`,
};

/**
 * Quiet art placeholder (P1.8, design.md section 5): a square on the elevated surface with the
 * monogram drawn by a CSS mask in the muted text color. It is decorative.
 */
export function ArtPlaceholder({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("aspect-square rounded-card bg-bg-elevated p-[20%]", className)}>
      <div
        data-slot="art-placeholder-mark"
        className="size-full bg-text-muted mask-contain mask-center mask-no-repeat"
        style={monogramMask}
      />
    </div>
  );
}
