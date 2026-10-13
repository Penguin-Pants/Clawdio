import { useEffect } from "react";
import { commands } from "@/lib/ipc/commands";
import * as log from "@/lib/log";
import { tokenPx, useTokenPx } from "@/lib/tokens";
import { useUiStore } from "@/store/ui";

/** The band height of the mini window: the compact band token (UD19, UD1). */
const BAND = "--size-transport-bar-compact";

const report = (error: unknown) => log.warn(`window: cannot switch the mini player: ${String(error)}`);

/**
 * Enters or leaves the mini player (TR-9, UD19). Entering sets the state; `useMiniWindow` then
 * sizes the window. Leaving returns the window to its normal size and position.
 */
export function setMiniPlayer(on: boolean): void {
  if (useUiStore.getState().mini === on) return;
  useUiStore.getState().setMini(on);
  if (!on) commands.windowSetMini(false, tokenPx(BAND)).catch(report);
}

/** While mini, sends the band height, and again when the root font size changes (UD19). */
export function useMiniWindow(): void {
  const mini = useUiStore((state) => state.mini);
  const height = useTokenPx(BAND);
  useEffect(() => {
    if (mini) commands.windowSetMini(true, height).catch(report);
  }, [mini, height]);
}
