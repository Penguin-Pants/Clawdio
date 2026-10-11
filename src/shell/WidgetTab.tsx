import { useEffect, useRef } from "react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { Icon } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WIDGETS, isWidgetId } from "./widgets";

function titleOf(id: string): string {
  return isWidgetId(id) ? WIDGETS[id].title : id;
}

/**
 * Widget header tab (P2.3, design.md section 6): drag grip, title and a close control. A tab
 * cannot hold a focusable child, so the close control is for the pointer only; the menu hides
 * widgets from the keyboard (R29 non-drag path).
 */
export function WidgetTab({ api }: IDockviewPanelHeaderProps) {
  const title = titleOf(api.id);
  return (
    <div className="flex h-full items-center gap-1.5 pr-1 pl-2">
      <Icon name="grip" className="size-3.5 text-text-muted" />
      <span className="truncate text-[13px]">{title}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-hidden="true"
              data-slot="tab-close"
              className="grid size-6 place-items-center rounded-[min(var(--radius-md),10px)] text-text-muted transition-colors hover:bg-accent hover:text-foreground"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                api.close();
              }}
            />
          }
        >
          <Icon name="close" className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>{`Hide ${title}`}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Library tab: no close button. The dock closes a focused tab on Delete or Backspace, so the
 * tab element stops those keys before they reach the dock (P2.3, R28).
 */
export function LibraryTab({ api }: IDockviewPanelHeaderProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tab = ref.current?.closest<HTMLElement>(".dv-tab");
    if (!tab) return;
    const stopClose = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    tab.addEventListener("keydown", stopClose);
    return () => tab.removeEventListener("keydown", stopClose);
  }, []);
  return (
    <div ref={ref} className="flex h-full items-center gap-1.5 pr-2 pl-2">
      <Icon name="grip" className="size-3.5 text-text-muted" />
      <span className="truncate text-[13px]">{titleOf(api.id)}</span>
    </div>
  );
}
