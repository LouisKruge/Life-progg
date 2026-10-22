import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, List, Lock, Minus, Network, Plus, RotateCcw } from "lucide-react";
import type { SkillNodeView, SkillTreeView } from "@shared/types";
import { useSkills } from "@/lib/queries-progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PageHeader, QueryError } from "./common";

const COL = 220;
const ROW = 150;
const NODE_W = 170;
const NODE_H = 64;

export function SkillTreesPage() {
  const { data, error, refetch } = useSkills();
  const [treeKey, setTreeKey] = useState("wealth");
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selected, setSelected] = useState<SkillNodeView | null>(null);
  if (error) return <QueryError error={error} retry={refetch} />;
  const tree = data?.find((t) => t.key === treeKey);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Skill Trees"
        title="Grown from real accomplishments"
        description="Nodes unlock automatically from completed quests, savings, streaks and milestones, once the skills before them are unlocked. Nothing here can be bought or clicked open."
        actions={
          <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="View">
            <button role="tab" aria-selected={view === "graph"} onClick={() => setView("graph")} className={cn("flex items-center gap-1.5 rounded px-3 py-1.5 text-sm", view === "graph" ? "bg-surface-3" : "text-muted-foreground")}><Network className="size-3.5" /> Graph</button>
            <button role="tab" aria-selected={view === "list"} onClick={() => setView("list")} className={cn("flex items-center gap-1.5 rounded px-3 py-1.5 text-sm", view === "list" ? "bg-surface-3" : "text-muted-foreground")}><List className="size-3.5" /> List</button>
          </div>
        }
      />
      {!data ? <Skeleton className="h-[520px]" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" role="tablist" aria-label="Skill trees">
            {data.map((t) => (
              <button key={t.key} role="tab" aria-selected={treeKey === t.key} onClick={() => { setTreeKey(t.key); setSelected(null); }}
                className={cn("rounded-xl border px-4 py-3 text-left transition-colors", treeKey === t.key ? "border-accent bg-surface-2" : "border-border bg-surface hover:bg-surface-2")}>
                <div className="text-[13px] font-semibold tracking-[0.14em] uppercase">{t.name}</div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">{t.unlocked}/{t.total} · {t.xp.toLocaleString("en-ZA")} XP</div>
                <ProgressBar value={t.unlocked / t.total} className="mt-2 h-1" label={`${t.name} tree progress`} />
              </button>
            ))}
          </div>
          {tree && (view === "graph" ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 xl:col-span-8"><TreeGraph tree={tree} selected={selected} onSelect={setSelected} /></div>
              <div className="col-span-12 xl:col-span-4"><NodeDetail tree={tree} node={selected} /></div>
            </div>
          ) : <TreeList tree={tree} />)}
        </>
      )}
    </div>
  );
}

function nodeState(n: SkillNodeView) {
  return n.unlockedAt ? "unlocked" : n.available ? "available" : "locked";
}

/** SVG node graph with wheel zoom, drag pan and keyboard-focusable nodes. */
function TreeGraph({ tree, selected, onSelect }: { tree: SkillTreeView; selected: SkillNodeView | null; onSelect: (n: SkillNodeView) => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [tree.key]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(2, Math.max(0.5, z * (e.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const pos = (n: SkillNodeView) => ({ x: 40 + n.x * COL, y: 30 + n.y * ROW });
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <Button size="icon-sm" variant="secondary" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z * 1.2))}><Plus /></Button>
        <Button size="icon-sm" variant="secondary" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}><Minus /></Button>
        <Button size="icon-sm" variant="secondary" aria-label="Reset view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}><RotateCcw /></Button>
      </div>
      <div
        ref={box}
        className="h-[560px] cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ backgroundImage: "radial-gradient(circle, #1f2126 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
        onPointerMove={(e) => { if (drag.current) setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
      >
        <svg width="100%" height="100%" role="group" aria-label={`${tree.name} skill tree`}>
          <g transform={`translate(${pan.x + 24}, ${pan.y + 24}) scale(${zoom})`}>
            {tree.nodes.flatMap((n) =>
              n.parentKeys.map((pk) => {
                const p = byKey.get(pk);
                if (!p) return null;
                const a = pos(p);
                const b = pos(n);
                const lit = Boolean(n.unlockedAt);
                return (
                  <motion.path
                    key={`${pk}-${n.key}`}
                    d={`M ${a.x + NODE_W / 2} ${a.y + NODE_H} C ${a.x + NODE_W / 2} ${a.y + NODE_H + 45}, ${b.x + NODE_W / 2} ${b.y - 45}, ${b.x + NODE_W / 2} ${b.y}`}
                    fill="none"
                    stroke={lit ? "#d4d4d8" : "#303238"}
                    strokeWidth={lit ? 2 : 1.5}
                    strokeDasharray={lit ? undefined : "4 5"}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6 }}
                  />
                );
              }),
            )}
            {tree.nodes.map((n) => {
              const { x, y } = pos(n);
              const state = nodeState(n);
              const isSel = selected?.key === n.key;
              return (
                <g
                  key={n.key}
                  transform={`translate(${x}, ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.name}: ${state}. ${n.condition}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelect(n)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(n))}
                  className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-foreground"
                >
                  <rect width={NODE_W} height={NODE_H} rx={12} fill={state === "unlocked" ? "#24262b" : "#121316"} stroke={isSel ? "#f5f5f5" : state === "unlocked" ? "#d4d4d8" : state === "available" ? "#6b6e76" : "#303238"} strokeWidth={isSel ? 2 : 1.2} />
                  <text x={14} y={26} fill={state === "locked" ? "#6b6e76" : "#f5f5f5"} fontSize={13} fontWeight={600}>{n.name}</text>
                  <text x={14} y={46} fill="#9a9da5" fontSize={10.5}>{state === "unlocked" ? "Unlocked" : state === "available" ? `${Math.floor(n.progress * 100)}% · next up` : "Locked"}</text>
                  {state !== "unlocked" && <rect x={14} y={54} width={NODE_W - 28} height={2} rx={1} fill="#24262b" />}
                  {state !== "unlocked" && <rect x={14} y={54} width={(NODE_W - 28) * n.progress} height={2} rx={1} fill="#9a9da5" />}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="border-t border-border px-4 py-2 text-[11px] text-subtle-foreground">Scroll to zoom · drag to pan · Tab and Enter to explore nodes</div>
    </Card>
  );
}

function NodeDetail({ tree, node }: { tree: SkillTreeView; node: SkillNodeView | null }) {
  if (!node) {
    return (
      <Card className="h-full">
        <CardHeader><CardTitle>{tree.name}</CardTitle></CardHeader>
        <CardContent className="pt-3 text-sm text-muted-foreground">
          <p>{tree.description}</p>
          <p className="mt-3">Select a node to see what unlocks it.</p>
        </CardContent>
      </Card>
    );
  }
  const state = nodeState(node);
  return (
    <Card className="h-full">
      <CardHeader><CardTitle>{state === "unlocked" ? "Unlocked skill" : state === "available" ? "Next up" : "Locked skill"}</CardTitle></CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="text-xl font-semibold">{node.name}</div>
        <p className="text-sm text-muted-foreground">{node.description}</p>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <div className="text-label mb-1">Unlock condition</div>
          {node.condition}
          {node.parentKeys.length > 0 && <div className="mt-1 text-xs text-subtle-foreground">Requires: {node.parentKeys.map((k) => tree.nodes.find((n) => n.key === k)?.name ?? k).join(", ")}</div>}
        </div>
        {state !== "unlocked" && <ProgressBar value={node.progress} label={`${node.name} progress`} />}
        {node.unlockedAt && <p className="text-xs text-subtle-foreground">Unlocked {new Date(node.unlockedAt).toLocaleDateString("en-ZA")}</p>}
      </CardContent>
    </Card>
  );
}

/** Accessible alternative to the graph: the same tree as an ordered list. */
function TreeList({ tree }: { tree: SkillTreeView }) {
  const sorted = [...tree.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <Card>
      <CardHeader><CardTitle>{tree.name} · list view</CardTitle></CardHeader>
      <CardContent className="pt-3">
        <ol className="divide-y divide-border/60">
          {sorted.map((n) => {
            const state = nodeState(n);
            return (
              <li key={n.key} className="flex items-center gap-4 py-3">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border", state === "unlocked" ? "border-accent bg-foreground text-background" : "border-border text-subtle-foreground")}>
                  {state === "unlocked" ? <Check className="size-4" /> : state === "locked" ? <Lock className="size-3.5" /> : <span className="text-[10px] tabular-nums">{Math.floor(n.progress * 100)}%</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.name} <span className="ml-1 text-xs font-normal text-subtle-foreground">{state}</span></span>
                  <span className="block text-xs text-muted-foreground">{n.condition}{n.parentKeys.length > 0 && ` · after ${n.parentKeys.map((k) => tree.nodes.find((x) => x.key === k)?.name ?? k).join(", ")}`}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
