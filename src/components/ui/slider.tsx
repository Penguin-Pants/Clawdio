import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

type SliderProps = Omit<SliderPrimitive.Root.Props<number>, "children"> & {
  /** Accessible name of the thumb. */
  label: string;
  /** `aria-valuetext`, for example "2:14 of 4:32" (P7.7). */
  valueText: (value: number) => string;
};

/**
 * A one-thumb slider (design.md section 6): decorative steel track, red range and a 12 px red
 * thumb that is always visible. Arrows, Page Up, Page Down, Home and End move it. The thumb
 * shows the global focus ring when its input has keyboard focus (P0.10).
 */
function Slider({ className, label, valueText, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      thumbAlignment="edge"
      className={cn("relative flex w-full touch-none items-center select-none data-disabled:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-5 w-full items-center">
        <SliderPrimitive.Track data-slot="slider-track" className="relative h-1 w-full rounded-full bg-brand-steel">
          <SliderPrimitive.Indicator data-slot="slider-range" className="h-full rounded-full bg-brand-red" />
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            aria-label={label}
            getAriaValueText={(_formatted, value) => valueText(value)}
            className="block size-3 rounded-full bg-brand-red has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-red forced-colors:bg-[CanvasText] forced-colors:has-[:focus-visible]:outline-[Highlight]"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
