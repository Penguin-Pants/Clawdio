import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsDialog } from "@/dialogs/SettingsDialog";
import { installKeyboard } from "@/lib/keyboard";
import { AppHeader } from "@/shell/AppHeader";
import { DockShell } from "@/shell/DockShell";
import { StatusLine } from "@/shell/StatusLine";

/** The app shell: header strip, dock and status line. No layout hides the header or the status line (R29). */
export function App() {
  useEffect(() => installKeyboard(), []);
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
    </TooltipProvider>
  );
}
