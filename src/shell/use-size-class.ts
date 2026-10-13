import { type RefObject, useLayoutEffect, useState } from "react";
import { observeSize } from "@/lib/resize";

/** Transport band size classes by the band's own width (UD3, rework 6.2). */
export const SIZE_CLASSES = ["xs", "sm", "md", "lg", "xl"] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

/** The lower bound of each class in px; the bound belongs to the class (420 px is SM). */
const STEPS: [number, SizeClass][] = [
  [1200, "xl"],
  [900, "lg"],
  [640, "md"],
  [420, "sm"],
];

export function sizeClassOf(width: number): SizeClass {
  return STEPS.find(([minimum]) => width >= minimum)?.[1] ?? "xs";
}

/** True when `size` is `minimum` or a larger class. */
export function atLeast(size: SizeClass, minimum: SizeClass): boolean {
  return SIZE_CLASSES.indexOf(size) >= SIZE_CLASSES.indexOf(minimum);
}

/**
 * The size class of an element, measured by its own width, not the window (TR-2). The class
 * changes at most once per animation frame (PF-2, `observeSize`).
 */
export function useSizeClass(ref: RefObject<HTMLElement | null>): SizeClass {
  const [size, setSize] = useState<SizeClass>("md");
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The first paint already has the right class.
    if (element.offsetWidth > 0) setSize(sizeClassOf(element.offsetWidth));
    // The border box: the band's padding is part of its width.
    return observeSize(element, (entry) =>
      setSize(sizeClassOf(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width)),
    );
  }, [ref]);
  return size;
}
