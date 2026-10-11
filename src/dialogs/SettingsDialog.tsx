import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUiStore } from "@/store/ui";

/** Settings dialog. P4 adds the music folder, the Online lookups switch and About. */
export function SettingsDialog() {
  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>No settings yet.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
