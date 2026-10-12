import { useEffect, useId, useRef, useState } from "react";
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
import { commands, type ImportReport, type MetadataPreview } from "@/lib/ipc/commands";
import type { MetadataField } from "@/lib/ipc/bindings/MetadataField";
import type { MissingReason } from "@/lib/ipc/bindings/MissingReason";
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
  // One create at a time: a second Enter or click while the first runs would fail as "Taken".
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const ready = checked === name && problem === null && !pending;
  const create = async () => {
    if (!ready || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    let id = -1;
    const done = await playlistEdit(async () => {
      id = await commands.playlistCreate(name);
    }, "Cannot create the playlist");
    pendingRef.current = false;
    setPending(false);
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
        <p id={messageId} role="alert" className="min-h-5 text-xs text-text-secondary">
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
function DeletePlaylistDialog({ id, fileName }: { id: number; fileName: string }) {
  const close = useUiStore((state) => state.closeDialog);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete playlist</DialogTitle>
        <DialogDescription>
          Delete the file <code>{fileName}</code>? The songs stay in your music folder.
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

const REASONS: Record<MissingReason, string> = {
  notFound: "not found",
  ambiguous: "more than one match",
  noLocation: "no file location",
};

/**
 * The import report (P12.5): per new playlist, the matched count, then each missing entry and
 * why. Entries with no file location are in the report only. A playlist that could not be
 * written shows its error.
 */
function ImportReportDialog({ reports }: { reports: ImportReport[] }) {
  const close = useUiStore((state) => state.closeDialog);
  const imported = reports.filter((report) => report.error === null).length;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import report</DialogTitle>
        <DialogDescription>
          {reports.length === 0
            ? "The file holds no playlist to import."
            : `${imported === 1 ? "One playlist" : `${imported} playlists`} imported. Missing songs stay in the file and show as missing.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex max-h-80 flex-col gap-3 overflow-auto text-sm">
        {reports.map((report, index) => (
          <section key={index} aria-label={report.playlist}>
            <h3 className="font-medium">{report.playlist}</h3>
            <p className="text-text-secondary">
              {report.error === null
                ? `${report.matched} matched, ${report.missing.length} missing`
                : `Not imported: ${report.error}`}
            </p>
            {report.missing.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-text-secondary">
                {report.missing.map((entry, index) => (
                  <li key={index}>
                    {entry.label}: {REASONS[entry.reason]}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <DialogFooter>
        <Button onClick={close}>OK</Button>
      </DialogFooter>
    </>
  );
}

const FIELDS: Record<MetadataField, string> = { title: "Title", track: "Track number", year: "Year" };

/**
 * The metadata preview (P16.4): song, field and proposed value, for missing fields only.
 * Confirm writes the album's sidecar; Cancel writes nothing.
 */
function MetadataDialog({ album, preview }: { album: number; preview: MetadataPreview }) {
  const close = useUiStore((state) => state.closeDialog);
  const confirm = () => {
    close();
    void commands.metadataApply(album).catch((error: unknown) => {
      const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
      useUiStore.getState().showMessage(message || "Cannot save the metadata");
    });
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Fill missing metadata</DialogTitle>
        <DialogDescription>
          Proposed values for {preview.album}. The app writes them to the album&apos;s sidecar.json after you confirm.
          Embedded tags stay as they are.
        </DialogDescription>
      </DialogHeader>
      {preview.corruptSidecar && (
        <p role="alert" className="text-sm text-text-primary">
          The album&apos;s sidecar.json cannot be read. Confirm replaces it.
        </p>
      )}
      <div
        role="region"
        aria-label="Proposed values"
        tabIndex={0}
        className="max-h-80 overflow-auto text-sm focus-visible:-outline-offset-2"
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Proposed values for {preview.album}</caption>
          <thead className="text-text-secondary">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Song
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Field
              </th>
              <th scope="col" className="py-1 font-medium">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, index) => (
              <tr key={index}>
                <td className="py-1 pr-3 break-all">{row.song}</td>
                <td className="py-1 pr-3 text-text-secondary">{FIELDS[row.field]}</td>
                <td className="py-1">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button onClick={confirm}>Confirm</Button>
      </DialogFooter>
    </>
  );
}

function Body({ dialog }: { dialog: AppDialog }) {
  switch (dialog.kind) {
    case "newPlaylist":
      return <NewPlaylistDialog addTracks={dialog.addTracks} />;
    case "deletePlaylist":
      return <DeletePlaylistDialog id={dialog.id} fileName={dialog.fileName} />;
    case "error":
      return <ErrorDialog text={dialog.text} />;
    case "importReport":
      return <ImportReportDialog reports={dialog.reports} />;
    case "metadataPreview":
      return <MetadataDialog album={dialog.album} preview={dialog.preview} />;
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
