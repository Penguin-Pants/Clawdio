import { useEffect, useRef, useState } from "react";
import type { DockviewGroupPanelApi, IDockviewHeaderActionsProps, IDockviewPanelHeaderProps } from "dockview-react";
import { IconButton } from "@/components/icon-button";
import { Icon, type IconName } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import { dockWidget, floatWidget } from "./layouts";
import { useCollapseStore } from "@/store/collapse";
import { collapseGroup, restoreGroup } from "./splitters";
import { WIDGETS, isWidgetId } from "./widgets";

function titleOf(id: string): string {
  return isWidgetId(id) ? WIDGETS[id].title : id;
}

/** True while the group floats; follows moves between the grid and a floating group. */
function useFloating(api: DockviewGroupPanelApi): boolean {
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
}: {
  icon: IconName;
  label: string;
  slot: string;
  onPress: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-hidden="true"
            data-slot={slot}
            className="grid size-5 place-items-center rounded-[min(var(--radius-md),10px)] text-text-muted transition-colors hover:bg-accent hover:text-foreground"
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

/**
 * The group header action (DK-3, SP-6, UD17, UD25): one "Widget options" menu button at the right
 * of the tab bar with Float or Dock and Collapse or Restore for the group's active widget. One
 * small button keeps the tabs in view in a narrow tabbed group. Hidden while the layout is
 * locked (DK-5).
 */
export function GroupActions({ activePanel, group }: IDockviewHeaderActionsProps) {
  const floating = useFloating(group.api);
  const locked = useUiStore((state) => state.locked);
  const collapsed = useCollapseStore((state) => state.sizes[group.id] !== undefined);
  const id = activePanel?.id;
  if (locked || id === undefined || !isWidgetId(id)) return null;
  const title = titleOf(id);
  return (
    <div className="flex h-full items-center px-1" onPointerDown={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              icon="more"
              label={`${title} options`}
              size="icon-xs"
              data-slot="group-options"
              className="text-text-muted"
            />
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          {floating ? (
            <DropdownMenuItem onClick={() => dockWidget(id)}>Dock widget</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => floatWidget(id)}>Float widget</DropdownMenuItem>
          )}
          {!floating &&
            (collapsed ? (
              <DropdownMenuItem onClick={() => restoreGroup(id)}>Restore widget</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => collapseGroup(id)}>Collapse widget</DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Widget header tab (P2.3, design.md section 6): drag grip, title and a close control. Tab
 * controls are for the pointer only; the menu shows, hides, floats, docks, collapses and restores
 * widgets from the keyboard (R29 non-drag path).
 */
export function WidgetTab({ api }: IDockviewPanelHeaderProps) {
  const title = titleOf(api.id);
  return (
    <div className="flex h-full items-center gap-1 pr-1 pl-2">
      <Icon name="grip" className="size-3.5 text-text-muted" />
      <span data-slot="tab-title" className="truncate text-[13px]">
        {title}
      </span>
      <TabControl icon="close" label={`Hide ${title}`} slot="tab-close" onPress={() => api.close()} />
    </div>
  );
}

/**
 * Library tab: no close button. The dock closes a focused tab on Delete or Backspace, so the
 * tab element stops those keys before they reach the dock (P2.3, R28). Library may float (the
 * group actions).
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
      <span data-slot="tab-title" className="truncate text-[13px]">
        {titleOf(api.id)}
      </span>
    </div>
  );
}
