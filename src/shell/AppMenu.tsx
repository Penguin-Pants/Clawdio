import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useColumnsStore } from "@/store/columns";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { commands } from "@/lib/ipc/commands";
import { RESET_SHORTCUT_LABEL } from "@/lib/keyboard";
import {
  activeWidget,
  applyPreset,
  moveWidgetBy,
  resetLayout,
  resizeWidgetBy,
  setWidgetVisible,
  useGridStore,
} from "./layouts";
import { setMiniPlayer } from "./mini";
import { PRESETS, PRESET_IDS } from "./presets";
import { WIDGET_IDS, WIDGETS, type WidgetId } from "./widgets";

/** The move and resize steps of the active widget (R38.10 menu path). */
const ARRANGE: { label: string; run: (id: WidgetId) => void }[] = [
  { label: "Move left", run: (id) => moveWidgetBy(id, -1, 0) },
  { label: "Move right", run: (id) => moveWidgetBy(id, 1, 0) },
  { label: "Move up", run: (id) => moveWidgetBy(id, 0, -1) },
  { label: "Move down", run: (id) => moveWidgetBy(id, 0, 1) },
  { label: "Wider", run: (id) => resizeWidgetBy(id, 1, 0) },
  { label: "Narrower", run: (id) => resizeWidgetBy(id, -1, 0) },
  { label: "Taller", run: (id) => resizeWidgetBy(id, 0, 1) },
  { label: "Shorter", run: (id) => resizeWidgetBy(id, 0, -1) },
];

/**
 * The menu button (P2.6, R5, R38): View (every widget, show and hide), Layout (the presets, Lock
 * layout, move and resize of the active widget, the transport bar items, Reset layout), Settings
 * and Rescan.
 */
export function AppMenu() {
  const layout = useGridStore((state) => state.layout);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const openDialog = useUiStore((state) => state.openDialog);
  const density = useColumnsStore((state) => state.density);
  const setDensity = useColumnsStore((state) => state.setDensity);
  const locked = useUiStore((state) => state.locked);
  const setLocked = useUiStore((state) => state.setLocked);
  const hasFolder = useSettingsStore((state) => state.view.folderState === "ready");
  // The tooltip would cover the open menu, so it is off while the menu shows.
  const [open, setOpen] = useState(false);
  // The widget the move and resize items act on, read when the menu opens.
  const active = open ? activeWidget() : null;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip disabled={open}>
        <TooltipTrigger
          render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />} />}
        >
          <Icon name="menu" />
        </TooltipTrigger>
        <TooltipContent>Menu</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          {/* One submenu keeps the menu short enough for the 560 px window (no scrolling). */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {WIDGET_IDS.map((id) => (
                <DropdownMenuCheckboxItem
                  key={id}
                  checked={layout[id] !== undefined}
                  disabled={!WIDGETS[id].hideable}
                  onCheckedChange={(checked) => setWidgetVisible(id, checked)}
                >
                  {WIDGETS[id].title}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {/* Row density (TB-14), saved in columns.json. */}
          <DropdownMenuCheckboxItem
            checked={density === "compact"}
            onCheckedChange={(checked) => setDensity(checked ? "compact" : "regular")}
          >
            Compact rows
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Layout</DropdownMenuLabel>
          {PRESET_IDS.map((id) => (
            <DropdownMenuItem key={id} onClick={() => applyPreset(id)}>
              {PRESETS[id].title}
            </DropdownMenuItem>
          ))}
          <DropdownMenuCheckboxItem checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
            Lock layout
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={active === null || locked}>
              {active === null ? "Arrange widget" : `Arrange ${WIDGETS[active].title}`}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {ARRANGE.map((step) => (
                <DropdownMenuItem key={step.label} onClick={() => active && step.run(active)}>
                  {step.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Transport bar</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {/* The dialog opens after the menu closed, so the menu returns focus first. */}
              <DropdownMenuItem onClick={() => requestAnimationFrame(() => openDialog({ kind: "customizeTransport" }))}>
                Customize transport bar…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMiniPlayer(true)}>Mini player</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => resetLayout()}>
            Reset layout
            <DropdownMenuShortcut>{RESET_SHORTCUT_LABEL}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Settings</DropdownMenuItem>
        <DropdownMenuItem disabled={!hasFolder} onClick={() => void commands.rescan().catch(() => {})}>
          Rescan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
