import { motion } from "motion/react";
import { NAV } from "@/lib/nav";
import { navigate, usePath } from "@/lib/router";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const path = usePath();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-[#0c0d10]">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="grid size-8 place-items-center rounded-lg border border-border bg-surface-2">
          <span className="text-sm font-bold tracking-tighter">L1</span>
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-[0.18em]">LEVEL ONE</div>
          <div className="text-[10px] tracking-wider text-subtle-foreground">LIFE OPERATING SYSTEM</div>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV.map((item) => {
          const active = item.path === "/" ? path === "/" : path.startsWith(item.path);
          const Icon = item.icon;
          return (
            <a
              key={item.path}
              href={item.path}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                navigate(item.path);
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors",
                active ? "text-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-md border border-border bg-surface-2"
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <Icon className="relative size-4" strokeWidth={1.75} />
              <span className="relative flex-1">{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-4 text-[11px] text-subtle-foreground">
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[10px]">Ctrl K</kbd> command palette
      </div>
    </aside>
  );
}
