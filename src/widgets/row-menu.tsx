import { type RefObject, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A context menu item: an action, or a submenu with `items`. An item with neither shows
 * disabled.
 */
export interface RowMenuItem {
  label: string;
  run?: () => void;
  items?: RowMenuItem[];
}

function MenuItems({ items }: { items: RowMenuItem[] }) {
  // Keys by place: two playlists in different folders can share a name.
  return items.map((item, index) =>
    item.items ? (
      <DropdownMenuSub key={index}>
        <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <MenuItems items={item.items} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : (
      <DropdownMenuItem key={index} disabled={!item.run} onClick={item.run}>
        {item.label}
      </DropdownMenuItem>
    ),
  );
}

/** The list element inside a list frame: menus return focus to it. */
export function listElement(frame: RefObject<HTMLElement | null>): HTMLElement | null {
  return frame.current?.querySelector<HTMLElement>('[role="listbox"], [role="tree"]') ?? null;
}

/** True for the keys that open the context menu of the active row (R25, P6-AC10). */
function isMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

interface MenuRequest {
  anchor: HTMLElement;
  items: RowMenuItem[];
}

/** A row context menu that opens at a row on right-click or on the menu keys (P6.6, P7.9, P7.10). */
export function useRowMenu(listRef: RefObject<HTMLElement | null>) {
  const [request, setRequest] = useState<MenuRequest | null>(null);
  const element = (
    <DropdownMenu open={request !== null} onOpenChange={(open) => !open && setRequest(null)}>
      <DropdownMenuContent anchor={request?.anchor} side="bottom" align="start" finalFocus={() => listElement(listRef)}>
        {request && <MenuItems items={request.items} />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  /** Opens the menu at the active row of a list key event. True when the key was a menu key. */
  const fromKey = (event: React.KeyboardEvent<HTMLElement>, items: RowMenuItem[] | null) => {
    if (!isMenuKey(event)) return false;
    event.preventDefault();
    const anchor = event.currentTarget.querySelector<HTMLElement>("[data-active]");
    if (anchor && items) setRequest({ anchor, items });
    return true;
  };
  const open = (anchor: HTMLElement, items: RowMenuItem[]) => setRequest({ anchor, items });
  return { element, fromKey, open };
}
