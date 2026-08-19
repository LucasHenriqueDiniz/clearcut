import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-[3px] rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] font-medium",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] bg-white/[0.04] text-[var(--muted)]",
        primary: "border-white/20 bg-white/10 text-white",
        success: "border-[var(--green-hi)] bg-[var(--green-lo)] text-emerald-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
        danger: "border-red-500/22 bg-[var(--red-lo)] text-red-400",
        destructive: "border-red-500/22 bg-[var(--red-lo)] text-red-400",
        info: "border-[var(--accent-hi)] bg-[var(--accent-lo)] text-indigo-300",
        processing: "border-[var(--accent-hi)] bg-[var(--accent-lo)] text-indigo-300",
        secondary: "border-white/[0.08] bg-white/[0.05] text-zinc-300",
        ghost: "bg-transparent text-zinc-300 border border-transparent",
        outline: "border-white/[0.15] bg-transparent text-zinc-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
