import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Archive, ArchiveRestore, CalendarRange, Check, Flag, PartyPopper, Play, Plus, Star, X } from "lucide-react";
import type { SeasonView } from "@shared/types";
import { useAddSeasonGoal, useCreateSeason, useSaveReview, useSeasonAction, useSeasons, useUpdateSeasonGoal } from "@/lib/queries-progress";
import { useDashboard, useSettings } from "@/lib/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PageHeader, QueryError } from "./common";

export function SeasonsPage() {
  const { data, error, refetch } = useSeasons();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  if (error) return <QueryError error={error} retry={refetch} />;
  const selected = data?.find((s) => s.id === selectedId) ?? data?.find((s) => s.status === "active") ?? data?.[0];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Life Seasons"
        title="Ninety days at a time"
        description="Three primary objectives, weekly reviews and a celebration at the end. Seasons never reset lifetime XP, credits, achievements or money records."
        actions={<Button onClick={() => setCreating(true)}><Plus /> New season</Button>}
      />
      {!data ? <Skeleton className="h-96" /> : data.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No seasons yet" action={<Button size="sm" onClick={() => setCreating(true)}><Plus /> Plan your first season</Button>}>
          A season focuses the next ninety days on a few things that matter, without making everything else feel like failure.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-2 xl:col-span-3">
            {data.map((s) => (
              <button key={s.id} onClick={() => setSelectedId(s.id)} className={cn("w-full rounded-xl border px-4 py-3 text-left", selected?.id === s.id ? "border-accent bg-surface-2" : "border-border bg-surface hover:bg-surface-2", s.status === "archived" && "opacity-60")}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{s.name}</span><Badge variant={s.status === "active" ? "solid" : "outline"} className="capitalize">{s.status}</Badge></div>
                <div className="mt-1 text-xs text-subtle-foreground">{s.startDate} → {s.endDate}</div>
              </button>
            ))}
          </div>
          <div className="col-span-12 xl:col-span-9">{selected && <SeasonDetail season={selected} />}</div>
        </div>
      )}
      <CreateSeasonDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function SeasonDetail({ season: s }: { season: SeasonView }) {
  const action = useSeasonAction();
  const addGoal = useAddSeasonGoal();
  const updateGoal = useUpdateSeasonGoal();
  const { data: settings } = useSettings();
  const [goalTitle, setGoalTitle] = useState("");
  const [goalPrimary, setGoalPrimary] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const open = s.status === "planned" || s.status === "active";
  const primary = s.goals.filter((g) => g.isPrimary && g.status !== "dropped");
  const secondary = s.goals.filter((g) => !g.isPrimary || g.status === "dropped");
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-label">{s.status === "active" ? `Day ${s.dayNumber} of ${s.totalDays}` : `${s.totalDays} days`}</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{s.name}</h2>
              {s.theme && <p className="mt-1 text-sm text-muted-foreground">{s.theme}</p>}
              <p className="mt-1 text-xs text-subtle-foreground">{formatDate(s.startDate, settings?.locale)} → {formatDate(s.endDate, settings?.locale)}</p>
            </div>
            <div className="flex gap-2">
              {s.status === "planned" && <Button onClick={() => action.mutate({ id: s.id, action: "activate" })}><Play /> Start season</Button>}
              {s.status === "active" && <Button onClick={() => setConfirmComplete(true)}><Flag /> Complete season</Button>}
              {(s.status === "completed" || s.status === "planned") && <Button variant="ghost" onClick={() => action.mutate({ id: s.id, action: "archive" })}><Archive /> Archive</Button>}
              {s.status === "archived" && <Button variant="ghost" onClick={() => action.mutate({ id: s.id, action: "unarchive" })}><ArchiveRestore /> Restore</Button>}
            </div>
          </div>
          {s.status === "active" && <ProgressBar value={s.dayNumber / s.totalDays} className="mt-4 h-2" label="Season progress" />}
          <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div><dt className="text-label">Season XP</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{s.xp.toLocaleString("en-ZA")}</dd></div>
            <div><dt className="text-label">Quests</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{s.questsCompleted}</dd></div>
            <div><dt className="text-label">Celebration</dt><dd className="mt-1 flex items-center gap-1.5 text-sm"><PartyPopper className="size-4 text-muted-foreground" />{s.celebration || "Not set"}</dd></div>
          </dl>
        </CardContent>
      </Card>

      {s.summary && (
        <Card className="border-accent/60">
          <CardHeader><CardTitle>End-of-season summary</CardTitle><span className="text-xs text-muted-foreground">Frozen {s.completedAt?.slice(0, 10)}</span></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 pt-3 text-sm md:grid-cols-4">
            <div><div className="text-label">XP earned</div><div className="mt-1 text-xl font-semibold">{s.summary.xpEarned.toLocaleString("en-ZA")}</div></div>
            <div><div className="text-label">Objectives</div><div className="mt-1 text-xl font-semibold">{s.summary.goalsAchieved}/{s.summary.goalsTotal}</div></div>
            <div><div className="text-label">Achievements</div><div className="mt-1 text-xl font-semibold">{s.summary.achievementsUnlocked}</div></div>
            <div><div className="text-label">Savings at end</div><div className="mt-1 text-xl font-semibold">{formatMoney(s.summary.savingsAtEndCents, settings?.currency, settings?.locale)}</div></div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-7">
          <CardHeader><CardTitle>Objectives</CardTitle><span className="text-xs text-muted-foreground">{primary.length}/3 primary</span></CardHeader>
          <CardContent className="space-y-1 pt-3">
            {s.goals.length === 0 && <p className="text-sm text-muted-foreground">No objectives yet.</p>}
            {[...primary, ...secondary].map((g) => (
              <div key={g.id} className={cn("flex items-center gap-3 rounded-lg px-2 py-2", g.status === "dropped" && "opacity-50")}>
                <button disabled={!open || g.status === "dropped"} onClick={() => updateGoal.mutate({ id: g.id, status: g.status === "achieved" ? "open" : "achieved" })} aria-label={g.status === "achieved" ? `Reopen ${g.title}` : `Mark ${g.title} achieved`}
                  className={cn("grid size-6 shrink-0 place-items-center rounded-md border", g.status === "achieved" ? "border-foreground bg-foreground text-background" : "border-[#4a4d55]")}>
                  {g.status === "achieved" && <Check className="size-4" strokeWidth={3} />}
                </button>
                <span className={cn("flex-1 text-sm", g.status === "achieved" && "text-muted-foreground line-through", g.status === "dropped" && "line-through")}>{g.title}</span>
                {g.isPrimary && g.status !== "dropped" && <Star className="size-3.5 fill-accent text-accent" aria-label="Primary" />}
                {g.status === "dropped" && <Badge>Changed course</Badge>}
                {open && g.status !== "dropped" && <Button size="icon-sm" variant="ghost" aria-label={`Drop ${g.title}`} title="Life changed: drop this objective (kept for the record)" onClick={() => updateGoal.mutate({ id: g.id, status: "dropped" })}><X /></Button>}
                {open && g.status === "dropped" && <Button size="sm" variant="ghost" onClick={() => updateGoal.mutate({ id: g.id, status: "open" })}>Restore</Button>}
              </div>
            ))}
            {open && (
              <form className="flex items-center gap-2 pt-3" onSubmit={(e) => { e.preventDefault(); if (goalTitle.trim()) addGoal.mutate({ seasonId: s.id, title: goalTitle.trim(), isPrimary: goalPrimary }, { onSuccess: () => setGoalTitle("") }); }}>
                <Input aria-label="New objective" value={goalTitle} maxLength={160} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Add an objective" />
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">Primary <Switch checked={goalPrimary} onCheckedChange={setGoalPrimary} aria-label="Primary objective" /></label>
                <Button type="submit" size="sm" variant="secondary" disabled={!goalTitle.trim()}>Add</Button>
              </form>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader><CardTitle>Weekly XP</CardTitle></CardHeader>
          <CardContent className="h-56 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.weeklyXp.map((w, i) => ({ ...w, label: `W${i + 1}` }))} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6b6e76", fontSize: 10 }} interval={1} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#6b6e76", fontSize: 10 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#1b1d21", border: "1px solid #303238", borderRadius: 8, fontSize: 12 }} labelFormatter={(_, p) => `Week of ${p?.[0]?.payload?.weekStart ?? ""}`} />
                <Bar dataKey="xp" fill="#d4d4d8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <WeeklyReview season={s} />

      <ConfirmDialog
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        title={`Complete “${s.name}”?`}
        description="The season's summary is frozen and added to your timeline. Lifetime XP, credits and records stay exactly as they are."
        confirmLabel="Complete season"
        onConfirm={() => action.mutate({ id: s.id, action: "complete" })}
      />
    </div>
  );
}

function WeeklyReview({ season: s }: { season: SeasonView }) {
  const save = useSaveReview();
  const { data: dash } = useDashboard();
  const current = s.reviews[0];
  const [f, setF] = useState({ wins: "", challenges: "", nextFocus: "", rating: 0 });
  useEffect(() => setF({ wins: current?.wins ?? "", challenges: current?.challenges ?? "", nextFocus: current?.nextFocus ?? "", rating: current?.rating ?? 0 }), [current?.id, current?.wins, current?.challenges, current?.nextFocus, current?.rating]);
  const canWrite = s.status === "active" && dash && dash.today >= s.startDate && dash.today <= s.endDate;
  return (
    <Card>
      <CardHeader><CardTitle>Weekly reviews</CardTitle><span className="text-xs text-muted-foreground">{s.reviews.length} written</span></CardHeader>
      <CardContent className="pt-3">
        {canWrite && (
          <form className="mb-6 space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ seasonId: s.id, wins: f.wins, challenges: f.challenges, nextFocus: f.nextFocus, rating: f.rating || null }); }}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="What went well?" htmlFor="rv-w"><Textarea id="rv-w" value={f.wins} maxLength={4000} onChange={(e) => setF({ ...f, wins: e.target.value })} /></Field>
              <Field label="What was hard?" htmlFor="rv-c"><Textarea id="rv-c" value={f.challenges} maxLength={4000} onChange={(e) => setF({ ...f, challenges: e.target.value })} /></Field>
              <Field label="Focus for next week" htmlFor="rv-n"><Textarea id="rv-n" value={f.nextFocus} maxLength={4000} onChange={(e) => setF({ ...f, nextFocus: e.target.value })} /></Field>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="How did the week feel?">
                <span className="mr-2 text-xs text-muted-foreground">How did the week feel?</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} role="radio" aria-checked={f.rating === n} aria-label={`${n} of 5`} onClick={() => setF({ ...f, rating: n })}>
                    <Star className={cn("size-4", n <= f.rating ? "fill-accent text-accent" : "text-subtle-foreground")} />
                  </button>
                ))}
              </div>
              <Button type="submit" size="sm" disabled={save.isPending}>Save this week's review</Button>
            </div>
          </form>
        )}
        {s.reviews.length === 0 ? <p className="text-sm text-muted-foreground">{canWrite ? "Your first review will appear here." : "No reviews were written."}</p> : (
          <ul className="space-y-3">
            {s.reviews.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
                <div className="flex justify-between text-xs text-subtle-foreground"><span>Week of {r.weekStart}</span>{r.rating && <span>{"★".repeat(r.rating)}</span>}</div>
                {r.wins && <p className="mt-1"><span className="text-muted-foreground">Went well: </span>{r.wins}</p>}
                {r.challenges && <p className="mt-1"><span className="text-muted-foreground">Hard: </span>{r.challenges}</p>}
                {r.nextFocus && <p className="mt-1"><span className="text-muted-foreground">Next: </span>{r.nextFocus}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CreateSeasonDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateSeason();
  const { data: dash } = useDashboard();
  const [f, setF] = useState({ name: "", startDate: "", theme: "", celebration: "", goals: ["", "", ""], activate: true });
  useEffect(() => { if (open && dash) setF((x) => ({ ...x, startDate: x.startDate || dash.today })); }, [open, dash]);
  const goals = f.goals.map((g) => g.trim()).filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New season" description="Ninety days. Pick up to three primary objectives; everything else is secondary.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (f.name.trim() && f.startDate) create.mutate({ name: f.name.trim(), startDate: f.startDate, theme: f.theme.trim(), celebration: f.celebration.trim(), goals: goals.map((title) => ({ title, isPrimary: true })), activate: f.activate }, { onSuccess: () => { onOpenChange(false); setF({ name: "", startDate: "", theme: "", celebration: "", goals: ["", "", ""], activate: true }); } }); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" htmlFor="sn-name"><Input id="sn-name" autoFocus maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Foundation" /></Field>
            <Field label="Start date" htmlFor="sn-start" hint="Ends 90 days later."><Input id="sn-start" type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} className="[color-scheme:dark]" /></Field>
          </div>
          <Field label="Theme (optional)" htmlFor="sn-theme"><Input id="sn-theme" maxLength={300} value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} placeholder="What is this season about?" /></Field>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Primary objectives</div>
            {f.goals.map((g, i) => <Input key={i} aria-label={`Primary objective ${i + 1}`} maxLength={160} value={g} onChange={(e) => setF({ ...f, goals: f.goals.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={["Save R20,000", "Train three times a week", "Finish the online course"][i]} />)}
          </div>
          <Field label="Celebration at the end" htmlFor="sn-cel"><Input id="sn-cel" maxLength={300} value={f.celebration} onChange={(e) => setF({ ...f, celebration: e.target.value })} placeholder="e.g. A weekend in the Drakensberg" /></Field>
          <label className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">Start it now <Switch checked={f.activate} onCheckedChange={(v) => setF({ ...f, activate: v })} aria-label="Start now" /></label>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={!f.name.trim() || !f.startDate || create.isPending}>Create season</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
