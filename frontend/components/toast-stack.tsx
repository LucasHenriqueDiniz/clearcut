"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant?: "info" | "success" | "error";
};

type Props = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

const variantStyles = {
  info: {
    icon: Info,
    className: "border-[var(--border-m)] bg-white/[0.04] text-zinc-100",
    iconClassName: "text-zinc-400",
  },
  success: {
    icon: CheckCircle2,
    className: "border-[var(--green-hi)] bg-emerald-500/[0.08] text-emerald-50",
    iconClassName: "text-emerald-300",
  },
  error: {
    icon: AlertCircle,
    className: "border-red-500/22 bg-[var(--red-lo)] text-red-50",
    iconClassName: "text-red-300",
  },
} as const;

export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed right-[14px] bottom-[14px] z-[80] flex w-[286px] max-w-[286px] flex-col-reverse gap-[7px]">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const variant = variantStyles[toast.variant ?? "info"];
          const Icon = variant.icon;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "pointer-events-auto rounded-[12px] border shadow-2xl backdrop-blur-[14px]",
                variant.className,
              )}
            >
              <div className="flex items-start gap-[9px] px-[13px] py-[11px]">
                <Icon className={cn("mt-0.5 h-[13px] w-[13px] shrink-0", variant.iconClassName)} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-[2px] break-words text-[11px] text-current/70">{toast.description}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-6 w-6 shrink-0"
                  onClick={() => onDismiss(toast.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
