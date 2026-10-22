import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Network, Trophy } from "lucide-react";
import { useMarkUnlocksSeen, useUnseenUnlocks, type UnseenUnlock } from "@/lib/queries-progress";

/** Shows newly unlocked achievements and skills one at a time, then marks them seen on the server. */
export function UnlockCelebration() {
  const { data } = useUnseenUnlocks();
  const markSeen = useMarkUnlocksSeen();
  const [queue, setQueue] = useState<UnseenUnlock[]>([]);
  const current = queue[0];

  useEffect(() => {
    if (data && data.length > 0) {
      setQueue((q) => [...q, ...data.filter((d) => !q.some((x) => x.kind === d.kind && x.id === d.id))]);
      markSeen.mutate();
    }
    // Only react to new server data; the mutation object changes identity every render.
  }, [data]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 3600);
    return () => clearTimeout(t);
  }, [current]);

  return (
    <div className="pointer-events-none fixed top-20 left-1/2 z-[65] -translate-x-1/2" aria-live="polite">
      <AnimatePresence mode="wait">
        {current && (
          <motion.button
            key={`${current.kind}-${current.id}`}
            onClick={() => setQueue((q) => q.slice(1))}
            initial={{ opacity: 0, y: -24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="pointer-events-auto relative flex min-w-80 items-center gap-4 overflow-hidden rounded-xl border border-accent/50 bg-surface-2 px-5 py-4 text-left shadow-2xl shadow-black/70"
          >
            <motion.span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
            />
            <span className="relative grid size-11 place-items-center rounded-full border border-accent/60 bg-surface-3">
              {current.kind === "achievement" ? <Trophy className="size-5" /> : <Network className="size-5" />}
            </span>
            <span className="relative">
              <span className="text-label block">{current.kind === "achievement" ? `Achievement unlocked${current.tier ? ` · ${current.tier}` : ""}` : "Skill unlocked"}</span>
              <span className="block text-base font-semibold">{current.name}</span>
              <span className="block max-w-72 truncate text-xs text-muted-foreground">{current.detail}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
