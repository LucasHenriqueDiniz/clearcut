import { cn } from "@/lib/utils";

export function StatusDot({ status }: { status: "idle" | "uploading" | "processing" | "done" | "error" }) {
  const color =
    status === "idle"
      ? "bg-[var(--muted)]"
      : status === "uploading"
        ? "bg-[var(--amber)] [animation:queue-pulse_0.8s_ease-in-out_infinite]"
        : status === "processing"
          ? "bg-[#818cf8] [animation:queue-pulse_1s_ease-in-out_infinite]"
          : status === "done"
            ? "bg-[var(--green)]"
            : "bg-[var(--red)]";
  return <span className={cn("inline-block h-[5px] w-[5px] rounded-full", color)} />;
}
