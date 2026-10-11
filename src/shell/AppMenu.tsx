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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LIBRARY_MODES, type LibraryMode, useLibraryStore } from "@/store/library";
import { useUiStore } from "@/store/ui";
import { MODE_LABELS } from "@/widgets/library/LibraryWidget";
import { RESET_SHORTCUT_LABEL } from "@/lib/keyboard";
import { LAYOUTS, LAYOUT_TITLES, applyLayout, resetLayout, setWidgetVisible } from "./layouts";
import { WIDGET_IDS, WIDGETS } from "./widgets";

/** The menu button (P2.6, R5, R29 non-drag path): Widgets, Library mode, Layouts, Settings and Rescan. */
export function AppMenu() {
  const visible = useUiStore((state) => state.visibleWidgets);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const mode = useLibraryStore((state) => state.mode);
  const setMode = useLibraryStore((state) => state.setMode);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />} />}
        >
          <Icon name="menu" />
        </TooltipTrigger>
        <TooltipContent>Menu</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Widgets</DropdownMenuLabel>
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
          <DropdownMenuLabel>Layouts</DropdownMenuLabel>
          {LAYOUTS.map((id) => (
            <DropdownMenuItem key={id} onClick={() => applyLayout(id)}>
              {LAYOUT_TITLES[id]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => resetLayout()}>
            Reset layout
            <DropdownMenuShortcut>{RESET_SHORTCUT_LABEL}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Settings</DropdownMenuItem>
        <DropdownMenuItem disabled>Rescan</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
