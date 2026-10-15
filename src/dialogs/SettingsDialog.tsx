import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppName } from "@/lib/app-name";
import { commands, type MicDucking } from "@/lib/ipc/commands";
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

const DUCKING: { value: MicDucking; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "lower", label: "Lower volume" },
  { value: "pause", label: "Pause" },
];

const isDucking = (value: unknown): value is MicDucking => DUCKING.some((item) => item.value === value);

/**
 * "When the microphone is in use" (P20.4, R34): Off, Lower volume or Pause, and the ducked
 * volume for Lower volume. Windows only; other platforms do not show it (D53).
 */
function MicrophoneSection() {
  const view = useSettingsStore((state) => state.view);
  const [drag, setDrag] = useState<number | null>(null);
  if (!view.micDuckingSupported) return null;
  const percent = drag ?? view.micDuckPercent;
  return (
    <Section title="Microphone">
      <span id="mic-ducking-label" className="text-sm">
        When the microphone is in use
      </span>
      <ToggleGroup
        aria-labelledby="mic-ducking-label"
        size="sm"
        spacing={1}
        value={[view.micDucking]}
        onValueChange={(values) => {
          const next = values[0];
          if (isDucking(next)) void change(() => commands.setMicDucking(next), "changing microphone ducking");
        }}
      >
        {DUCKING.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {view.micDucking === "lower" && (
        <div className="flex items-center gap-3 text-sm">
          <span className="shrink-0">Volume {percent}%</span>
          <Slider
            label="Ducked volume"
            className="flex-1"
            min={5}
            max={90}
            step={5}
            largeStep={10}
            value={percent}
            valueText={(value) => `${value} percent of your volume`}
            onValueChange={(value) => setDrag(value)}
            onValueCommitted={(value) => {
              setDrag(null);
              void change(() => commands.setMicDuckPercent(value), "changing the ducked volume");
            }}
          />
        </div>
      )}
      <p className="text-sm text-text-secondary">
        The music changes while another app records, for example a dictation tool or a call. A tool that keeps the
        microphone open, such as Handy with Always-On Microphone, keeps the music down while it runs.
      </p>
    </Section>
  );
}

/** Settings (P4.10): music folder, Online lookups, microphone ducking, the log folder and About (D12). */
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
          {view.lastScan && (
            <p className="text-sm text-text-secondary">
              Last scan: {view.lastScan.added} added, {view.lastScan.removed} removed, {view.lastScan.skipped} skipped
            </p>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={chooseMusicFolder}>
              Change folder
            </Button>
          </div>
        </Section>
        <Section title="Online lookups">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Look up missing album art and lyrics on MusicBrainz, Cover Art Archive, LRCLIB and lyrics.ovh</span>
            <Switch
              checked={view.onlineLookups}
              onCheckedChange={(on) => void change(() => commands.setOnlineLookups(on), "changing Online lookups")}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className={view.onlineLookups ? undefined : "text-text-secondary"}>
              Fetch lyrics automatically
              <span className="block text-text-secondary">For the playing song and the next song</span>
            </span>
            <Switch
              checked={view.autoLyrics}
              disabled={!view.onlineLookups}
              onCheckedChange={(on) =>
                void change(() => commands.setAutoLyrics(on), "changing Fetch lyrics automatically")
              }
            />
          </label>
        </Section>
        <MicrophoneSection />
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
