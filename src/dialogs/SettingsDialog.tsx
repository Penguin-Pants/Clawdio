import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAppName } from "@/lib/app-name";
import { commands } from "@/lib/ipc/commands";
import { error } from "@/lib/log";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

/** Runs a settings command and stores the new view. A failure shows in the status line. */
async function change(run: () => Promise<Awaited<ReturnType<typeof commands.settingsGet>>>, what: string) {
  try {
    useSettingsStore.getState().set(await run());
  } catch (reason) {
    error(`settings: ${what} failed: ${String(reason)}`);
    const message = reason && typeof reason === "object" && "message" in reason ? String(reason.message) : what;
    useUiStore.getState().showMessage(message);
  }
}

export function chooseMusicFolder() {
  void change(commands.chooseMusicFolder, "choosing the music folder");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-3">
      <h3 className="text-[13px] text-text-secondary">{title}</h3>
      {children}
    </section>
  );
}

function useVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);
  return version;
}

/** Settings (P4.10): music folder, Online lookups, the log folder and About (D12). */
export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  const view = useSettingsStore((state) => state.view);
  const name = useAppName();
  const version = useVersion();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Section title="Music folder">
          <p className="text-sm break-all">{view.folderName ?? "No folder chosen"}</p>
          {view.folderState === "missing" && (
            <p className="text-sm text-text-secondary">The folder is not available.</p>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={chooseMusicFolder}>
              Change folder
            </Button>
          </div>
        </Section>
        <Section title="Online lookups">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Look up missing album art and lyrics on MusicBrainz, Cover Art Archive and LRCLIB</span>
            <Switch
              checked={view.onlineLookups}
              onCheckedChange={(on) => void change(() => commands.setOnlineLookups(on), "changing Online lookups")}
            />
          </label>
        </Section>
        <Section title="Log">
          <div>
            <Button variant="outline" size="sm" onClick={() => void commands.openLogFolder().catch(() => {})}>
              Open log folder
            </Button>
          </div>
        </Section>
        <Section title="About">
          <Wordmark className="h-6 w-auto self-start" />
          <p className="text-sm">
            {name} {version}
          </p>
          <p className="text-sm text-text-secondary">MIT license</p>
          <div>
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => void commands.openNotice().catch(() => {})}
            >
              Third-party notices
            </Button>
          </div>
        </Section>
      </DialogContent>
    </Dialog>
  );
}
