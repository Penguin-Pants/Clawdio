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
import { usePlayerStore } from "@/store/player";
import { usePlaylistsStore } from "@/store/playlists";
import { useSettingsStore } from "@/store/settings";

/** The app shell: header strip, dock and status line. No layout hides the header or the status line (R29). */
export function App() {
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
      <div className="flex h-screen flex-col overflow-hidden bg-bg-canvas">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col border-y">
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
