import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

/** Counts smoothly to `value` whenever it changes (instantly under reduced motion). */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString("en-ZA"), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || prev.current === value) {
      el.textContent = format(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => (el.textContent = format(v)) });
    prev.current = value;
    return () => controls.stop();
  }, [value, format, reduce]);
  return <span ref={ref} className={className}>{format(value)}</span>;
}
