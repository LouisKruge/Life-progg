import { useState } from "react";
import { motion } from "motion/react";
import {
  BookOpen, Briefcase, CalendarCheck, CalendarRange, ChevronsUp, Crown, Dumbbell, Flag, Flame, Footprints, Gem, Gift, Handshake, Heart, Landmark, Lock, Medal, PiggyBank, Plus, Rocket, ShieldCheck, Star, Trash2, Trophy, Unlink, Zap,
  type LucideIcon,
} from "lucide-react";
import type { AchievementView } from "@shared/types";
import { useAchievements, useCreateCustomAchievement, useDeleteAchievement, useUnlockAchievement } from "@/lib/queries-progress";
import { useSettings } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PageHeader, QueryError } from "./common";

export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  footprints: Footprints, zap: Zap, flame: Flame, "calendar-check": CalendarCheck, "calendar-range": CalendarRange, "piggy-bank": PiggyBank, landmark: Landmark,
  unlink: Unlink, "shield-check": ShieldCheck, dumbbell: Dumbbell, medal: Medal, "book-open": BookOpen, briefcase: Briefcase, heart: Heart, gift: Gift,
  "chevrons-up": ChevronsUp, crown: Crown, gem: Gem, flag: Flag, rocket: Rocket, trophy: Trophy, handshake: Handshake, star: Star,
};

const CATEGORIES: Array<{ key: AchievementView["category"] | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "wealth", label: "Wealth" },
  { key: "fitness", label: "Fitness" },
  { key: "discipline", label: "Discipline" },
  { key: "business", label: "Business" },
  { key: "learning", label: "Learning" },
  { key: "personal", label: "Personal life" },
  { key: "milestone", label: "Major milestones" },
];

/** Tiers are shown through border weight and glow rather than colour, to stay monochrome. */
const TIER_STYLE: Record<AchievementView["tier"], string> = {
  bronze: "border-border",
  silver: "border-[#4a4d55]",
  gold: "border-[#8d9098]",
  platinum: "border-accent shadow-[0_0_24px_-8px_rgba(212,212,216,0.45)]",
};

export function AchievementsPage() {
  const { data, error, refetch } = useAchievements();
  const { data: settings } = useSettings();
  const [filter, setFilter] = useState<(typeof CATEGORIES)[number]["key"]>("all");
  const [unlocking, setUnlocking] = useState<AchievementView | null>(null);
  const [creating, setCreating] = useState(false);
  if (error) return <QueryError error={error} retry={refetch} />;
  const list = (data ?? []).filter((a) => filter === "all" || a.category === filter);
  const unlockedCount = data?.filter((a) => a.unlockedAt).length ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Achievement Vault"
        title={`${unlockedCount} of ${data?.length ?? 0} unlocked`}
        description="Permanent records of real milestones. Automatic ones unlock from your data; real-world ones you confirm yourself, with optional evidence."
        actions={<Button variant="secondary" onClick={() => setCreating(true)}><Plus /> Custom achievement</Button>}
      />
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Achievement categories">
        {CATEGORIES.map((c) => (
          <button key={c.key} role="tab" aria-selected={filter === c.key} onClick={() => setFilter(c.key)} className={cn("rounded-full border px-3.5 py-1.5 text-xs", filter === c.key ? "border-accent bg-accent text-background" : "border-border text-muted-foreground hover:text-foreground")}>
            {c.label}
          </button>
        ))}
      </div>
      {!data ? <Skeleton className="h-96" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {list.map((a, i) => <AchievementCard key={a.id} a={a} index={i} locale={settings?.locale} onUnlock={() => setUnlocking(a)} />)}
        </div>
      )}
      <UnlockDialog achievement={unlocking} onClose={() => setUnlocking(null)} />
      <CustomDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function AchievementCard({ a, index, locale, onUnlock }: { a: AchievementView; index: number; locale?: string; onUnlock: () => void }) {
  const del = useDeleteAchievement();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Trophy;
  const done = Boolean(a.unlockedAt);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.02, 0.3) }}>
      <Card className={cn("h-full", done ? TIER_STYLE[a.tier] : "opacity-80")}>
        <CardContent className="flex h-full gap-4 pt-5">
          <div className={cn("grid size-12 shrink-0 place-items-center rounded-xl border", done ? "border-accent/60 bg-gradient-to-b from-surface-3 to-surface-2 text-foreground" : "border-border bg-surface-2 text-subtle-foreground")}>
            {done ? <Icon className="size-5" /> : <Lock className="size-4" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className={cn("text-sm font-semibold", !done && "text-muted-foreground")}>{a.name}</div>
              <Badge variant={done ? "solid" : "outline"} className="capitalize">{a.tier}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
            <p className="mt-2 text-[11px] text-subtle-foreground">{a.condition}</p>
            <div className="mt-auto pt-3">
              {done ? (
                <div className="text-xs text-muted-foreground">
                  Unlocked {formatDate(a.unlockedAt!.slice(0, 10), locale)}
                  {a.evidence && <div className="mt-1 truncate italic text-subtle-foreground">“{a.evidence}”</div>}
                </div>
              ) : a.isCustom || a.condition.startsWith("Confirmed") ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" aria-label={`It happened: ${a.name}`} onClick={onUnlock}>It happened</Button>
                  {a.isCustom && <Button size="icon-sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => setConfirmDelete(true)}><Trash2 /></Button>}
                </div>
              ) : (
                <>
                  <ProgressBar value={a.progress} className="h-1" label={`${a.name} progress`} />
                  <div className="mt-1 text-[11px] text-subtle-foreground tabular-nums">{Math.floor(a.progress * 100)}%</div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete “${a.name}”?`} description="It hasn't been unlocked, so nothing is lost." danger confirmLabel="Delete" onConfirm={() => del.mutate(a.id)} />
    </motion.div>
  );
}

function UnlockDialog({ achievement, onClose }: { achievement: AchievementView | null; onClose: () => void }) {
  const unlock = useUnlockAchievement();
  const [evidence, setEvidence] = useState("");
  if (!achievement) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Unlock “${achievement.name}”`} description="Only confirm milestones that actually happened. Unlocks are permanent.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); unlock.mutate({ id: achievement.id, evidence: evidence.trim() }, { onSuccess: () => { onClose(); setEvidence(""); } }); }}>
          <Field label="Evidence or note (optional)" htmlFor="ev"><Textarea id="ev" autoFocus maxLength={2000} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="e.g. Deadlift 140 kg at the gym on Saturday" /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={unlock.isPending}>Unlock achievement</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CustomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateCustomAchievement();
  const [f, setF] = useState({ name: "", description: "", category: "personal" as AchievementView["category"], tier: "silver" as AchievementView["tier"] });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Custom achievement" description="A real-world milestone that matters to you. You'll unlock it yourself when it happens.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && f.description.trim()) create.mutate({ ...f, name: f.name.trim(), description: f.description.trim() }, { onSuccess: () => { onOpenChange(false); setF({ ...f, name: "", description: "" }); } }); }}>
          <Field label="Name" htmlFor="ca-name"><Input id="ca-name" autoFocus maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Ran a half marathon" /></Field>
          <Field label="Description" htmlFor="ca-desc"><Input id="ca-desc" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="ca-cat"><NativeSelect id="ca-cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as AchievementView["category"] })}>{CATEGORIES.filter((c) => c.key !== "all").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</NativeSelect></Field>
            <Field label="Tier" htmlFor="ca-tier"><NativeSelect id="ca-tier" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value as AchievementView["tier"] })}>{["bronze", "silver", "gold", "platinum"].map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></Field>
          </div>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!f.name.trim() || !f.description.trim() || create.isPending}>Add</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
