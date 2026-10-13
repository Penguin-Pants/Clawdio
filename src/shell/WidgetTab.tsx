import { useEffect, useRef, useState } from "react";
import type { DockviewPanelApi, IDockviewPanelHeaderProps } from "dockview-react";
import { Icon, type IconName } from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import { dockWidget, floatWidget } from "./layouts";
import { WIDGETS, isWidgetId } from "./widgets";

function titleOf(id: string): string {
  return isWidgetId(id) ? WIDGETS[id].title : id;
}

/** True while the panel's group floats; follows moves between the grid and a floating group. */
function useFloating(api: DockviewPanelApi): boolean {
  const [floating, setFloating] = useState(api.location.type === "floating");
  useEffect(() => {
    const subscription = api.onDidLocationChange((event) => setFloating(event.location.type === "floating"));
    return () => subscription.dispose();
  }, [api]);
  return floating;
}

/**
 * A pointer-only tab control (design.md section 6): a tab cannot hold a focusable child, so it
 * is hidden from the accessibility tree; the menu has the keyboard path (R29, UD17).
 */
function TabControl({
  icon,
  label,
  slot,
  onPress,
  className,
}: {
  icon: IconName;
  label: string;
  slot: string;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-hidden="true"
            data-slot={slot}
            className={cn(
              "grid size-5 place-items-center rounded-[min(var(--radius-md),10px)] text-text-muted transition-colors hover:bg-accent hover:text-foreground",
              className,
            )}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPress();
            }}
          />
        }
      >
        <Icon name={icon} className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Float or Dock (DK-3, UD17); hidden while the layout is locked (DK-5). */
function FloatControl({ api }: { api: DockviewPanelApi }) {
  const floating = useFloating(api);
  const locked = useUiStore((state) => state.locked);
  const id = api.id;
  if (locked || !isWidgetId(id)) return null;
  const title = titleOf(id);
  // Only the active tab of a group shows it, so narrow tabbed groups keep their tabs in view.
  const hidden = "in-[.dv-inactive-tab]:hidden";
  return floating ? (
    <TabControl icon="dock" label={`Dock ${title}`} slot="tab-dock" className={hidden} onPress={() => dockWidget(id)} />
  ) : (
    <TabControl
      icon="float"
      label={`Float ${title}`}
      slot="tab-float"
      className={hidden}
      onPress={() => floatWidget(id)}
    />
  );
}

/**
 * Widget header tab (P2.3, design.md section 6): drag grip, title, the Float or Dock control and
 * a close control. Tab controls are for the pointer only; the menu shows, hides, floats and
 * docks widgets from the keyboard (R29 non-drag path).
 */
export function WidgetTab({ api }: IDockviewPanelHeaderProps) {
  const title = titleOf(api.id);
  return (
    <div className="flex h-full items-center gap-1 pr-1 pl-2">
      <Icon name="grip" className="size-3.5 text-text-muted" />
      <span className="truncate text-[13px]">{title}</span>
      <FloatControl api={api} />
      <TabControl icon="close" label={`Hide ${title}`} slot="tab-close" onPress={() => api.close()} />
    </div>
  );
}

/**
 * Library tab: no close button. The dock closes a focused tab on Delete or Backspace, so the
 * tab element stops those keys before they reach the dock (P2.3, R28). Library may float.
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
    <div ref={ref} className="flex h-full items-center gap-1 pr-1 pl-2">
      <Icon name="grip" className="size-3.5 text-text-muted" />
      <span className="truncate text-[13px]">{titleOf(api.id)}</span>
      <FloatControl api={api} />
    </div>
  );
}
