import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border text-[12px] font-medium select-none transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/30 disabled:pointer-events-none disabled:opacity-35 active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary:
          "border-indigo-300/12 bg-[linear-gradient(180deg,hsl(var(--accent))_0%,rgba(79,70,229,0.82)_100%)] text-white shadow-[0_10px_30px_rgba(79,70,229,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-110 hover:shadow-[0_14px_34px_rgba(79,70,229,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
        default:
          "border-indigo-300/12 bg-[linear-gradient(180deg,hsl(var(--accent))_0%,rgba(79,70,229,0.82)_100%)] text-white shadow-[0_10px_30px_rgba(79,70,229,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] hover:brightness-110 hover:shadow-[0_14px_34px_rgba(79,70,229,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
        secondary:
          "border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/[0.12] hover:bg-white/[0.08]",
        danger: "border-red-500/20 bg-[linear-gradient(180deg,rgba(239,68,68,0.12),rgba(239,68,68,0.08))] text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:bg-red-500/[0.18]",
        destructive: "border-red-500/20 bg-[linear-gradient(180deg,rgba(239,68,68,0.12),rgba(239,68,68,0.08))] text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:bg-red-500/[0.18]",
        success: "border-emerald-500/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.12),rgba(16,185,129,0.08))] text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:bg-emerald-500/[0.18]",
        ghost: "border-transparent bg-transparent text-[var(--muted)] hover:border-white/[0.06] hover:bg-white/[0.05] hover:text-[var(--text)]",
        outline: "border-white/[0.12] bg-transparent text-zinc-200 hover:bg-white/[0.06]",
        link: "text-sky-300 hover:text-sky-200 underline underline-offset-4",
      },
      size: {
        default: "h-8 px-3.5",
        sm: "h-7 rounded-[7px] px-2.5 text-[11px]",
        lg: "h-10 px-5",
        icon: "h-[30px] w-[30px] rounded-[7px] px-0",
        "icon-sm": "h-7 w-7 rounded-[7px] px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
