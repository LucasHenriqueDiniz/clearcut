import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

type SliderProps = Omit<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  "value" | "defaultValue" | "onValueChange"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, value, onValueChange, min = 0, max = 100, step = 1, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    min={min}
    max={max}
    step={step}
    value={[value]}
    onValueChange={([next]) => {
      if (typeof next === "number") {
        onValueChange(next);
      }
    }}
    className={cn("relative flex w-full touch-none select-none items-center py-1", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-[hsl(var(--accent))]" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-3 w-3 rounded-full border border-white/20 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))]/30 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
));

Slider.displayName = "Slider";
