import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { commands } from "@/lib/ipc/commands";
import { addToPlaylist, playlistEdit } from "@/store/playlists";
import { type AppDialog, useUiStore } from "@/store/ui";

/** "New playlist" (P11.5, P11.6): a name with the R12 and D21 check shown inline. */
function NewPlaylistDialog({ addTracks }: { addTracks?: number[] }) {
  const close = useUiStore((state) => state.closeDialog);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [checked, setChecked] = useState("");
  const messageId = useId();
  useEffect(() => {
    let active = true;
    commands.playlistNameCheck(name).then(
      (message) => {
        if (!active) return;
        setProblem(message);
        setChecked(name);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [name]);
  // The empty-name message waits for typing; the button stays off meanwhile.
  const shown = name === "" ? null : problem;
  const ready = checked === name && problem === null;
  const create = async () => {
    if (!ready) return;
    let id = -1;
    const done = await playlistEdit(async () => {
      id = await commands.playlistCreate(name);
    }, "Cannot create the playlist");
    if (!done) return;
    close();
    if (addTracks) addToPlaylist(id, addTracks);
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>New playlist</DialogTitle>
        <DialogDescription>The app saves it as an .m3u8 file in the Playlists folder.</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label htmlFor={`${messageId}-name`} className="text-sm">
          Name
        </label>
        <Input
          id={`${messageId}-name`}
          value={name}
          autoFocus
          aria-invalid={shown !== null}
          aria-describedby={shown ? messageId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <p id={messageId} role="alert" className="min-h-5 text-[13px] text-text-secondary">
          {shown}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready}>
            Create
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** Delete playlist (R12): a confirmation that names the file. */
function DeletePlaylistDialog({ id, name }: { id: number; name: string }) {
  const close = useUiStore((state) => state.closeDialog);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete playlist</DialogTitle>
        <DialogDescription>
          Delete the file <code>{name}.m3u8</code>? The songs stay in your music folder.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            close();
            void playlistEdit(() => commands.playlistDelete(id), "Cannot delete the playlist");
          }}
        >
          Delete
        </Button>
      </DialogFooter>
    </>
  );
}

/** A failed playlist edit (P11.8): the old file stays as it was; playback goes on. */
function ErrorDialog({ text }: { text: string }) {
  const close = useUiStore((state) => state.closeDialog);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Cannot save the change</DialogTitle>
        <DialogDescription>{text}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={close}>OK</Button>
      </DialogFooter>
    </>
  );
}

function Body({ dialog }: { dialog: AppDialog }) {
  switch (dialog.kind) {
    case "newPlaylist":
      return <NewPlaylistDialog addTracks={dialog.addTracks} />;
    case "deletePlaylist":
      return <DeletePlaylistDialog id={dialog.id} name={dialog.name} />;
    case "error":
      return <ErrorDialog text={dialog.text} />;
  }
}

/** The app's small dialogs, one at a time. */
export function PlaylistDialogs() {
  const dialog = useUiStore((state) => state.dialog);
  const close = useUiStore((state) => state.closeDialog);
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">{dialog && <Body dialog={dialog} />}</DialogContent>
    </Dialog>
  );
}
