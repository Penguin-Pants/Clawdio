import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OnlineNoticeDialog } from "@/dialogs/OnlineNoticeDialog";
import { PlaylistDialogs } from "@/dialogs/PlaylistDialogs";
import { SettingsDialog } from "@/dialogs/SettingsDialog";
import { connectAppEvents } from "@/lib/app-events";
import { installKeyboard } from "@/lib/keyboard";
import { commands } from "@/lib/ipc/commands";
import { info } from "@/lib/log";
import { startPerfProbe } from "@/lib/perf";
import { AppHeader } from "@/shell/AppHeader";
import { DockShell } from "@/shell/DockShell";
import { StatusLine } from "@/shell/StatusLine";
import { TransportBand } from "@/shell/TransportBand";
import { usePlayerStore } from "@/store/player";
import { usePlaylistsStore } from "@/store/playlists";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

/**
 * The app shell: four fixed zones in a grid (plan section 5.1, SH-1): header strip, transport
 * band, dock and status line. The dock row is `minmax(0, 1fr)` (SH-3), so no list pushes the
 * band off screen, and the page never scrolls (SH-4). `data-transport` swaps the band and the
 * dock rows (SH-6). No layout hides the header, the band or the status line (R29).
 */
export function App() {
  const transportPosition = useUiStore((state) => state.transportPosition);
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
    void usePlayerStore.getState().load();
    void useSettingsStore.getState().load();
    void usePlaylistsStore.getState().load();
    return disconnect;
  }, []);
  return (
    <TooltipProvider delay={500}>
      <div data-shell="" data-transport={transportPosition} className="app-shell h-screen overflow-hidden bg-bg-canvas">
        <AppHeader />
        <TransportBand />
        <main className="relative flex min-h-0 min-w-0 flex-col [grid-area:dock]">
          <DockShell />
        </main>
        <StatusLine />
      </div>
      <SettingsDialog />
      <OnlineNoticeDialog />
      <PlaylistDialogs />
    </TooltipProvider>
  );
}
