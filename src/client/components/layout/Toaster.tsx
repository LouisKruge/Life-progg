import { AnimatePresence, motion } from "motion/react";
import { Coins, Info, TriangleAlert, X } from "lucide-react";
import { dismissToast, toastStore } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const toasts = toastStore.use();
  return (
    <div className="pointer-events-none fixed right-6 bottom-6 z-[60] flex w-80 flex-col gap-2" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface-2 px-4 py-3 shadow-xl shadow-black/50",
              t.kind === "error" ? "border-danger/60" : t.kind === "reward" ? "border-accent/60" : "border-border",
            )}
          >
            {t.kind === "error" ? <TriangleAlert className="mt-0.5 size-4 text-danger" /> : t.kind === "reward" ? <Coins className="mt-0.5 size-4 text-foreground" /> : <Info className="mt-0.5 size-4 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <div className={cn("text-sm font-medium", t.kind === "reward" && "font-semibold")}>{t.title}</div>
              {t.detail && <div className="mt-0.5 truncate text-xs text-muted-foreground">{t.detail}</div>}
            </div>
            <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="text-subtle-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
