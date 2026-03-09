import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
    thumbClassName?: string;
  }
>(({ className, thumbClassName, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-white/[0.08] bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[background-color,border-color,box-shadow]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-indigo-400/25 data-[state=checked]:bg-[hsl(var(--accent))] data-[state=checked]:shadow-[0_0_0_1px_rgba(99,102,241,0.16),0_8px_20px_rgba(79,70,229,0.18),inset_0_1px_0_rgba(255,255,255,0.14)] data-[state=unchecked]:bg-white/[0.08]",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-0 transition-transform duration-150",
        "data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-[2px]",
        thumbClassName,
      )}
    />
  </SwitchPrimitive.Root>
));

Switch.displayName = SwitchPrimitive.Root.displayName;
