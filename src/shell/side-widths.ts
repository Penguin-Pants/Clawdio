import type { DockviewApi, DockviewGroupPanel } from "dockview-react";

/** The docked groups beside the Library group (left or right of it), not floating ones. */
function sideGroups(api: DockviewApi): DockviewGroupPanel[] {
  const library = api.getPanel("library")?.group;
  if (!library || library.api.location.type !== "grid") return [];
  const center = library.element.getBoundingClientRect();
  return api.groups.filter((group) => {
    if (group === library || group.api.location.type !== "grid") return false;
    const box = group.element.getBoundingClientRect();
    return box.right <= center.left + 1 || box.left >= center.right - 1;
  });
}

/**
 * Sidebar widths stay in pixels and the Library group absorbs a dock resize (SP-4, UD16).
 * Dockview 8.5.1 groups have no layout priority, so after each dock size change the side
 * groups get their widths from before the change back. A drag or a new arrangement at the same
 * dock size records new widths. `onDockResize` runs once per frame of resizes (UD24).
 */
export function keepSideWidths(api: DockviewApi): { onDockResize: () => void; dispose: () => void } {
  let size = { width: api.width, height: api.height };
  let widths = new Map<string, number>();
  let restoring = false;
  const record = () => {
    widths = new Map(sideGroups(api).map((group) => [group.id, group.width]));
  };
  const layoutChange = api.onDidLayoutChange(() => {
    if (!restoring && api.width === size.width && api.height === size.height) record();
  });
  const onDockResize = () => {
    if (api.width === size.width && api.height === size.height) return;
    restoring = true;
    try {
      for (const [id, width] of widths) {
        const group = api.getGroup(id);
        if (group && Math.abs(group.width - width) > 0.5) group.api.setSize({ width });
      }
    } finally {
      restoring = false;
    }
    size = { width: api.width, height: api.height };
    record();
  };
  record();
  return { onDockResize, dispose: () => layoutChange.dispose() };
}
