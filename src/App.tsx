import { useEffect, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OnlineNoticeDialog } from "@/dialogs/OnlineNoticeDialog";
import { PlaylistDialogs } from "@/dialogs/PlaylistDialogs";
import { SettingsDialog } from "@/dialogs/SettingsDialog";
import { connectAppEvents } from "@/lib/app-events";
import { startSelectionRestore } from "@/store/selection-restore";
import { installKeyboard } from "@/lib/keyboard";
import { commands } from "@/lib/ipc/commands";
import { info } from "@/lib/log";
import { startPerfProbe } from "@/lib/perf";
import { observeSize } from "@/lib/resize";
import { AppHeader } from "@/shell/AppHeader";
import { GridShell } from "@/shell/GridShell";
import { useMiniWindow } from "@/shell/mini";
import { StatusLine } from "@/shell/StatusLine";
import { TransportBand } from "@/shell/TransportBand";
import { usePlayerStore } from "@/store/player";
import { usePlaylistsStore } from "@/store/playlists";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

/**
 * The app shell: three fixed zones (plan section 5.1, SH-1): header strip, the snap grid and the
 * status line. The grid row is `minmax(0, 1fr)` (SH-3) and the grid fills it (R38.1), so the page
 * never scrolls (SH-4). No layout hides the header or the status line (R29). The mini player
 * (UD19) shows the transport band only: the grid stays mounted, inert and off screen at its last
 * size.
 */
export function App() {
  const mini = useUiStore((state) => state.mini);
  useMiniWindow();
  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // The grid size before the mini player, kept as CSS variables so the off-screen grid keeps it.
  useEffect(() => {
    const shell = shellRef.current;
    const main = mainRef.current;
    if (!shell || !main) return;
    return observeSize(main, (entry) => {
      if (useUiStore.getState().mini) return;
      shell.style.setProperty("--dock-width", `${entry.contentRect.width}px`);
      shell.style.setProperty("--dock-height", `${entry.contentRect.height}px`);
    });
  }, []);
  useEffect(() => installKeyboard(), []);
  // CLAWDIO_PERF=1 logs input-to-paint times (P6.8, AC-2).
  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;
    commands.perfMode().then(
      (on) => {
        if (on && active) stop = startPerfProbe({ log: info });
      },
      () => {},
    );
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  useEffect(() => {
    const disconnect = connectAppEvents();
    // R37: set the restore token before the first await, so a user selection always wins.
    const stopRestore = startSelectionRestore();
    void usePlayerStore.getState().load();
    void useSettingsStore.getState().load();
    void usePlaylistsStore.getState().load();
    return () => {
      stopRestore();
      disconnect();
    };
  }, []);
  return (
    <TooltipProvider delay={500}>
      <div
        ref={shellRef}
        data-shell=""
        data-mini={mini ? "" : undefined}
        className="app-shell h-screen overflow-hidden bg-bg-canvas"
      >
        {!mini && <AppHeader />}
        {mini && (
          <section
            aria-label="Transport controls"
            data-widget="transport"
            tabIndex={-1}
            className="[grid-area:transport]"
          >
            <TransportBand />
          </section>
        )}
        <main ref={mainRef} inert={mini} className="relative flex min-h-0 min-w-0 flex-col [grid-area:dock]">
          <GridShell />
        </main>
        {!mini && <StatusLine />}
      </div>
      <SettingsDialog />
      <OnlineNoticeDialog />
      <PlaylistDialogs />
    </TooltipProvider>
  );
}
