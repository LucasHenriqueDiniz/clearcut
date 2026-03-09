import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("h-[2px] w-full overflow-hidden rounded-[1px] bg-white/[0.06]", className)}>
      <div
        className={cn("relative h-full rounded-full transition-all duration-500", indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ProgressBar({
  value,
  state,
  className,
}: {
  value: number;
  state?: "done" | "failed" | "processing" | "queued";
  className?: string;
}) {
  const color =
    state === "failed"
      ? "bg-[var(--red)]"
      : state === "done"
        ? "bg-[var(--green)]"
        : state === "processing"
          ? "overflow-hidden bg-[hsl(var(--accent))] [animation:queue-pulse_1.2s_ease-in-out_infinite] before:absolute before:inset-y-0 before:left-0 before:w-16 before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:content-[''] before:[animation:queue-sheen_1.35s_ease-in-out_infinite]"
          : "bg-white/[0.06]";

  return <Progress value={value} className={className} indicatorClassName={color} />;
}
