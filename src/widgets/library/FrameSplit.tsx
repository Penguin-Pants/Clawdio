import {
  type ISplitviewPanelProps,
  Orientation,
  type SplitviewApi,
  type SplitviewReadyEvent,
  SplitviewReact,
} from "dockview-react";
import { type ReactNode, useEffect, useRef } from "react";
import { type FrameGroup, frameFractions, useLibraryStore } from "@/store/library";

/** Frame minimums in px (D56): three Columns frames fit the 320 px Library minimum (D33). */
export const FRAME_MIN_WIDTH = 96;
export const FRAME_MIN_HEIGHT = 64;

export interface FrameView {
  id: string;
  content: ReactNode;
}

function FrameContent({ params }: ISplitviewPanelProps<{ content: ReactNode }>) {
  return params.content;
}

const COMPONENTS = { frame: FrameContent };

/** Handlers read the store, not a render value, so they always see the latest fractions. */
function currentFractions(group: FrameGroup): number[] {
  return frameFractions(useLibraryStore.getState().frames, group);
}

/**
 * Sets the frame minimums for this size, scaled in proportion when they do not fit (D56, D45),
 * then sizes the frames to the fractions. The last frame takes the rest.
 */
function applyFractions(api: SplitviewApi, horizontal: boolean, fractions: number[]): void {
  const total = horizontal ? api.width : api.height;
  if (total <= 0) return;
  const minimum = horizontal ? FRAME_MIN_WIDTH : FRAME_MIN_HEIGHT;
  const scale = Math.min(1, total / (minimum * api.panels.length));
  for (const panel of api.panels) panel.api.setConstraints({ minimumSize: minimum * scale });
  api.panels.slice(0, -1).forEach((panel, index) => panel.api.setSize({ size: (fractions[index] ?? 0) * total }));
}

/**
 * Library frames with splitters (P22.1, R28.1, D56). The sizes come from the Library store, so
 * each mode keeps its own; a splitter drag writes them back. Sashes are not in the Tab order (K5).
 */
export function FrameSplit({
  group,
  orientation,
  views,
}: {
  group: FrameGroup;
  orientation: Orientation;
  views: FrameView[];
}) {
  const fractions = useLibraryStore((state) => frameFractions(state.frames, group));
  const apiRef = useRef<SplitviewApi | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = orientation === Orientation.HORIZONTAL;

  const onReady = ({ api }: SplitviewReadyEvent) => {
    apiRef.current = api;
    // `addPanel` focuses the new panel; keep focus where it was (F6 order, mode switch by keyboard).
    const previous = document.activeElement;
    for (const view of views) {
      api.addPanel({ id: view.id, component: "frame", params: { content: view.content } });
    }
    if (document.activeElement !== previous) {
      if (previous instanceof HTMLElement && previous !== document.body) previous.focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
    // Only a splitter drag fires this event (dockview `onDidSashEnd`), so every result is saved.
    api.onDidLayoutChange(() => {
      const sizes = api.panels.map((panel) => (horizontal ? panel.api.width : panel.api.height));
      const sum = sizes.reduce((total, size) => total + size, 0);
      if (sum > 0)
        useLibraryStore.getState().setFrames(
          group,
          sizes.map((size) => size / sum),
        );
    });
    const element = containerRef.current;
    if (element) {
      api.layout(element.clientWidth, element.clientHeight);
      applyFractions(api, horizontal, currentFractions(group));
    }
  };

  // The container size drives the layout, so the saved fractions hold at every size.
  useEffect(() => {
    const element = containerRef.current;
    const observer = new ResizeObserver(() => {
      const api = apiRef.current;
      if (!api || !element) return;
      api.layout(element.clientWidth, element.clientHeight);
      applyFractions(api, horizontal, currentFractions(group));
    });
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [horizontal, group]);

  // A reset or a loaded layout changes the fractions from outside.
  useEffect(() => {
    const api = apiRef.current;
    if (api) applyFractions(api, horizontal, fractions);
  }, [fractions, horizontal]);

  return (
    <div ref={containerRef} data-frame-group={group} className="min-h-0 min-w-0 flex-1">
      <SplitviewReact
        className="size-full"
        orientation={orientation}
        components={COMPONENTS}
        onReady={onReady}
        disableAutoResizing
      />
    </div>
  );
}
