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
import {
  commands,
  type ImportBatch,
  type ImportReport,
  type MetadataPreview,
  type RepairBatch,
} from "@/lib/ipc/commands";
import type { MissingImport } from "@/lib/ipc/bindings/MissingImport";
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

/** The text when the prerequisite scan was canceled or failed (R33.1). */
export const CANCELED = "Canceled, nothing changed";

function MissingList({ missing }: { missing: MissingImport[] }) {
  if (missing.length === 0) return null;
  return (
    <ul className="mt-1 list-disc pl-5 text-text-secondary">
      {missing.map((entry, index) => (
        <li key={index}>
          {entry.label}: {REASONS[entry.reason]}
        </li>
      ))}
    </ul>
  );
}

/** One titled part of a report, left out when it is empty. */
function ReportPart({ title, children, count }: { title: string; children: React.ReactNode; count: number }) {
  if (count === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

/** One playlist in a report. Labels are names only, never paths (D13). */
function PlaylistPart({ name, summary, children }: { name: string; summary: string; children?: React.ReactNode }) {
  return (
    <section aria-label={name}>
      <h4>{name}</h4>
      <p className="text-text-secondary">{summary}</p>
      {children}
    </section>
  );
}

function count(n: number, one: string, many: string): string {
  return n === 1 ? `One ${one}` : `${n} ${many}`;
}

/** The parts of an import report (R32): what each source became. */
function ImportParts({ reports }: { reports: ImportReport[] }) {
  const imported = reports.filter((report) => report.status === "imported");
  const skipped = reports.filter((report) => report.status === "skipped");
  const failed = reports.filter((report) => report.status === "failed");
  return (
    <>
      <ReportPart title="Imported" count={imported.length}>
        {imported.map((report, index) => (
          <PlaylistPart
            key={index}
            name={report.playlist}
            summary={`${report.matched} matched, ${report.missing.length} missing`}
          >
            <MissingList missing={report.missing} />
          </PlaylistPart>
        ))}
      </ReportPart>
      <ReportPart title="Skipped" count={skipped.length}>
        {skipped.map((report, index) => (
          <PlaylistPart key={index} name={report.playlist} summary="Skipped, name exists" />
        ))}
      </ReportPart>
      <ReportPart title="Failed" count={failed.length}>
        {failed.map((report, index) => (
          <PlaylistPart key={index} name={report.playlist} summary={`Not imported: ${report.error ?? ""}`} />
        ))}
      </ReportPart>
    </>
  );
}

/**
 * The import report (P12.5, R32): imported playlists with the matched count and each missing
 * entry and why, skipped ones (name exists) and failed ones with the reason.
 */
function ImportReportDialog({ batch }: { batch: ImportBatch }) {
  const close = useUiStore((state) => state.closeDialog);
  const imported = batch.reports.filter((report) => report.status === "imported").length;
  const description = batch.canceled
    ? CANCELED
    : batch.reports.length === 0
      ? "The files hold no playlist to import."
      : `${count(imported, "playlist", "playlists")} imported. Missing songs stay in the file and show as missing.`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import report</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="flex max-h-80 flex-col gap-3 overflow-auto text-sm">
        <ImportParts reports={batch.reports} />
      </div>
      <DialogFooter>
        <Button onClick={close}>OK</Button>
      </DialogFooter>
    </>
  );
}

/**
 * The repair report (R33.5): per playlist, the fixed count and each entry that is still
 * missing with the reason, or the error that left the file as it was.
 */
function RepairReportDialog({ batch }: { batch: RepairBatch }) {
  const close = useUiStore((state) => state.closeDialog);
  const fixed = batch.reports.reduce((sum, report) => sum + report.fixed, 0);
  const description = batch.canceled
    ? CANCELED
    : batch.reports.length === 0
      ? "No playlist has missing songs."
      : `${count(fixed, "song", "songs")} found.`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Find missing songs</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="flex max-h-80 flex-col gap-3 overflow-auto text-sm">
        <ReportPart title="Repaired" count={batch.reports.length}>
          {batch.reports.map((report, index) => (
            <PlaylistPart
              key={index}
              name={report.playlist}
              summary={
                report.error === null
                  ? `${report.fixed} fixed, ${report.missing.length} still missing`
                  : `Not changed: ${report.error}`
              }
            >
              <MissingList missing={report.missing} />
            </PlaylistPart>
          ))}
        </ReportPart>
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
      return <ImportReportDialog batch={dialog.batch} />;
    case "repairReport":
      return <RepairReportDialog batch={dialog.batch} />;
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
