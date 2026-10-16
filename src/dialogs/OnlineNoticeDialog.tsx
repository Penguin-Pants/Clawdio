import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commands } from "@/lib/ipc/commands";
import { error } from "@/lib/log";
import { useSettingsStore } from "@/store/settings";

async function answer(on: boolean) {
  try {
    if (on !== useSettingsStore.getState().view.onlineLookups) await commands.setOnlineLookups(on);
    useSettingsStore.getState().set(await commands.firstRunNoticeDone());
  } catch (reason) {
    error(`notice: cannot save the answer: ${String(reason)}`);
  }
}

/** The notice stays until the user chooses (R7): Escape and outside clicks do not close it. */
function stayOpen() {
  // Only the two answer buttons close the notice.
}

/** The files the app may write into the music folder. */
function WrittenFiles() {
  return (
    <ul className="list-disc pl-5">
      <li>
        <code>cover.jpg</code> for album art
      </li>
      <li>
        <code>.lrc</code> and <code>.txt</code> files for lyrics
      </li>
      <li>
        <code>sidecar.json</code> for album details
      </li>
    </ul>
  );
}

/**
 * The first-run notice (R7, P4.6) and, for a user who turned lookups on before lyrics.ovh
 * joined, the updated notice (D64). It names the services and the files the app may write. It
 * stays until the user chooses, and does not show again.
 */
export function OnlineNoticeDialog() {
  const pending = useSettingsStore((state) => state.view.noticePending);
  const update = useSettingsStore((state) => !state.view.noticePending && state.view.noticeUpdate);
  return (
    <Dialog open={pending || update} disablePointerDismissal onOpenChange={stayOpen}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Online lookups</DialogTitle>
          <DialogDescription>
            {update && "Online lookups now also use lyrics.ovh. "}
            With online lookups on, the app finds missing album art and lyrics on MusicBrainz, Cover Art Archive, LRCLIB
            and lyrics.ovh. It sends artist, album and song names, never your files.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-text-secondary">
          <p>It can write these files into your music folder:</p>
          <WrittenFiles />
          <p>It never changes your audio files. You can change this choice in Settings.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => void answer(false)}>
            {update ? "Turn off" : "Keep off"}
          </Button>
          <Button onClick={() => void answer(true)}>{update ? "Keep on" : "Turn on"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
