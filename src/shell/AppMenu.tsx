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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useColumnsStore } from "@/store/columns";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import { useSettingsStore } from "@/store/settings";
import { type TransportPosition, useUiStore } from "@/store/ui";
import { commands } from "@/lib/ipc/commands";
import { MODE_LABELS } from "@/widgets/library/LibraryWidget";
import { RESET_SHORTCUT_LABEL } from "@/lib/keyboard";
import {
  activeWidget,
  applyPreset,
  dockWidget,
  floatWidget,
  getDock,
  isFloating,
  resetLayout,
  setWidgetVisible,
} from "./layouts";
import { setMiniPlayer } from "./mini";
import { PRESETS, PRESET_IDS } from "./presets";
import { collapseGroup, isCollapsed, restoreGroup } from "./splitters";
import { WIDGET_IDS, WIDGETS } from "./widgets";

/** The active widget and whether it floats, read when the menu opens (UD17). */
function activeWidgetState(open: boolean) {
  if (!open) return { id: null, floating: false, collapsed: false };
  const id = activeWidget();
  return {
    id,
    floating: id !== null && isFloating(getDock()?.getPanel(id)),
    collapsed: id !== null && isCollapsed(id),
  };
}

/**
 * The menu button (P2.6, R5, R29 non-drag path): View (every widget), Library mode, Layout
 * (presets, Lock layout, transport position, float and dock of the active widget, Reset layout),
 * Settings and Rescan (DK-5 to DK-9, SH-6, UD17).
 */
export function AppMenu() {
  const visible = useUiStore((state) => state.visibleWidgets);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const openDialog = useUiStore((state) => state.openDialog);
  const density = useColumnsStore((state) => state.density);
  const setDensity = useColumnsStore((state) => state.setDensity);
  const locked = useUiStore((state) => state.locked);
  const setLocked = useUiStore((state) => state.setLocked);
  const transportPosition = useUiStore((state) => state.transportPosition);
  const setTransportPosition = useUiStore((state) => state.setTransportPosition);
  const mode = useLibraryStore((state) => state.mode);
  const setMode = useLibraryStore((state) => state.setMode);
  const hasFolder = useSettingsStore((state) => state.view.folderState === "ready");
  // The tooltip would cover the open menu, so it is off while the menu shows.
  const [open, setOpen] = useState(false);
  const active = activeWidgetState(open);
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
          <DropdownMenuLabel>View</DropdownMenuLabel>
          {WIDGET_IDS.map((id) => (
            <DropdownMenuCheckboxItem
              key={id}
              checked={visible.includes(id)}
              disabled={!WIDGETS[id].hideable}
              onCheckedChange={(checked) => setWidgetVisible(id, checked)}
            >
              {WIDGETS[id].title}
            </DropdownMenuCheckboxItem>
          ))}
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
          <DropdownMenuLabel>Library mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={mode} onValueChange={(value: LibraryMode) => setMode(value)}>
            {LIBRARY_MODES.map((value) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {MODE_LABELS[value]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
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
          <DropdownMenuItem
            disabled={active.id === null || active.floating || locked}
            onClick={() => active.id && floatWidget(active.id)}
          >
            Float widget
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={active.id === null || !active.floating || locked}
            onClick={() => active.id && dockWidget(active.id)}
          >
            Dock widget
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={active.id === null || active.floating || active.collapsed || locked}
            onClick={() => active.id && collapseGroup(active.id)}
          >
            Collapse widget
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={active.id === null || !active.collapsed || locked}
            onClick={() => active.id && restoreGroup(active.id)}
          >
            Restore widget
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {/* One submenu keeps the menu short enough for the 800 px window (no scrolling). */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Transport bar</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={transportPosition}
                onValueChange={(value: TransportPosition) => setTransportPosition(value)}
              >
                <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
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
