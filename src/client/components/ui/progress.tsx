import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** Animated progress bar. `value` is 0..1. */
export function ProgressBar({ value, className, barClassName, label }: { value: number; className?: string; barClassName?: string; label: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <motion.div
        className={cn("h-full rounded-full bg-gradient-to-r from-[#8d9098] via-accent to-foreground", barClassName)}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />
    </div>
  );
}
