import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { celebrationStore } from "@/lib/celebrate";

/** Restrained full-screen level-up moment. Click, Escape or a timeout dismisses it. */
export function LevelUpOverlay() {
  const c = celebrationStore.use();
  useEffect(() => {
    if (!c) return;
    const close = () => celebrationStore.set(null);
    const t = setTimeout(close, 3800);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [c]);
  return (
    <AnimatePresence>
      {c && (
        <motion.div
          role="alertdialog"
          aria-label={`Level up: level ${c.level}`}
          className="fixed inset-0 z-[70] grid cursor-pointer place-items-center bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => celebrationStore.set(null)}
        >
          <div className="relative text-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/40"
                initial={{ scale: 0.4, opacity: 0.9 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 2, delay: i * 0.35, ease: "easeOut" }}
              />
            ))}
            <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 16, delay: 0.1 }}>
              <div className="text-label mb-4 tracking-[0.4em]">Level up</div>
              <div className="bg-gradient-to-b from-white to-[#8d9098] bg-clip-text text-[120px] leading-none font-bold tracking-tighter text-transparent tabular-nums">{c.level}</div>
              <div className="mt-4 text-lg text-muted-foreground">{c.rank}</div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
