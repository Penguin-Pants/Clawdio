import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui";

/** The fixed 24 px status line (P2.7, R5): a transient message, else the running job, else "Ready". */
export function StatusLine() {
  const job = useUiStore((state) => state.job);
  const message = useUiStore((state) => state.message);
  const text = message ?? job?.text ?? "Ready";
  return (
    <footer className="flex h-6 shrink-0 items-center gap-2 bg-bg-canvas px-3 text-[13px] text-text-secondary">
      <span role="status" className="truncate">
        {text}
      </span>
      {!message && job?.cancel && (
        <Button variant="ghost" size="xs" onClick={job.cancel}>
          Cancel
        </Button>
      )}
    </footer>
  );
}
