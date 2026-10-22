import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarRange, Coins, Compass, Flag, Gift, PiggyBank, Plus, ScrollText, Sparkles, Trophy } from "lucide-react";
import { levelFromXp, type DashboardData } from "@shared/types";
import { useCategories, useCreateSavingsGoal, useDashboard, useSavingsEntry, useSettings } from "@/lib/queries";
import { openQuestEditor } from "@/lib/ui-state";
import { navigate } from "@/lib/router";
import { formatDate, formatMoney, greeting, parseMoney, WEEKDAYS } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { QuestRow } from "@/components/quests/QuestRow";
import { PageHeader, QueryError } from "./common";

export function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard();
  const { data: settings } = useSettings();
  const { data: categories } = useCategories();
  const catName = useMemo(() => new Map(categories?.map((c) => [c.id, c.name])), [categories]);

  if (error) return <QueryError error={error} retry={refetch} />;
  if (isLoading || !data || !settings) return <DashboardSkeleton />;

  const c = data.character;
  const hour = Number(new Intl.DateTimeFormat("en-ZA", { hour: "numeric", hourCycle: "h23", timeZone: settings.timezone }).format(new Date()));
  const currency = settings.currency;
  const locale = settings.locale;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${c.rank} · Level ${c.level.level}`}
        title={`${greeting(hour)}, ${c.displayName}.`}
        description={data.isRestDay ? "It's a rest day. Daily quests are paused." : data.focus.headline}
      />

      {/* Hero: level, credits, today's completion */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-6">
          <CardContent className="pt-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-label">Level</div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-5xl font-semibold tracking-tight tabular-nums">{c.level.level}</span>
                  <span className="text-sm text-muted-foreground">{c.rank}</span>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground tabular-nums">
                <div>
                  <AnimatedNumber value={c.level.totalXp} className="text-foreground" /> lifetime XP
                </div>
                <div>{(c.level.xpForNextLevel - c.level.xpIntoLevel).toLocaleString("en-ZA")} XP to level {c.level.level + 1}</div>
              </div>
            </div>
            <ProgressBar value={c.level.xpIntoLevel / c.level.xpForNextLevel} className="mt-4 h-2" label="XP progress to next level" />
            {c.nextRank && <div className="mt-2 text-xs text-subtle-foreground">Next rank: {c.nextRank.title} at level {c.nextRank.minLevel}</div>}
          </CardContent>
        </Card>
        <Card className="col-span-6 xl:col-span-3">
          <CardContent className="pt-5">
            <div className="text-label flex items-center gap-2"><Coins className="size-3.5" /> Credits</div>
            <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={c.credits} />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">{c.stats.lifetimeCreditsEarned.toLocaleString("en-ZA")} earned in total. Credits have no cash value.</div>
          </CardContent>
        </Card>
        <Card className="col-span-6 xl:col-span-3">
          <CardContent className="pt-5">
            <div className="text-label">Today</div>
            <div className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={data.completion.percent} />
              <span className="text-2xl text-muted-foreground">%</span>
            </div>
            <ProgressBar value={data.completion.percent / 100} className="mt-4" label="Today's completion" />
            <div className="mt-2 text-xs text-muted-foreground">{data.completion.done} of {data.completion.total} required quests</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Today's missions */}
        <Card className="col-span-12 xl:col-span-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScrollText className="size-3.5" /> Today's missions</CardTitle>
            <div className="flex items-center gap-2">
              {data.workload.overLimit && (
                <span className="text-xs text-warning" title="Consider archiving or making some quests optional">
                  {data.workload.activeDailyQuests} daily quests · limit {data.workload.limit}
                </span>
              )}
              <Button size="sm" variant="secondary" onClick={() => openQuestEditor()}><Plus /> Add</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {data.quests.length === 0 ? (
              <EmptyState icon={ScrollText} title={data.isRestDay ? "Rest day" : "No missions yet"} action={<Button size="sm" onClick={() => openQuestEditor()}><Plus /> Create your first quest</Button>}>
                {data.isRestDay ? "Recovery counts. Nothing is required today." : "Start with one or two small daily quests. You can always add more later."}
              </EmptyState>
            ) : (
              <ul className="-mx-2 space-y-0.5">
                {data.quests.map((q) => <QuestRow key={q.instanceId} item={q} categoryName={q.quest.categoryId ? catName.get(q.quest.categoryId) : undefined} />)}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Focus */}
        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Compass className="size-3.5" /> Daily focus</CardTitle>
              <span className="text-[10px] tracking-wider text-subtle-foreground uppercase">{data.focus.source === "ai" ? "AI strategist" : "Planner · no AI"}</span>
            </CardHeader>
            <CardContent className="pt-3">
              <p className="text-sm font-medium">{data.focus.headline}</p>
              <ul className="mt-3 space-y-2">
                {data.focus.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-muted-foreground"><span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />{p}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <QuickActions />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <SavingsCard goal={data.savingsGoal} currency={currency} locale={locale} />
        <Card className="col-span-12 lg:col-span-6 xl:col-span-4">
          <CardHeader><CardTitle>Weekly activity</CardTitle><span className="text-xs text-muted-foreground tabular-nums">{data.weeklyActivity.reduce((s, d) => s + d.xp, 0).toLocaleString("en-ZA")} XP</span></CardHeader>
          <CardContent className="h-44 pt-2">
            <WeeklyChart data={data.weeklyActivity} />
          </CardContent>
        </Card>
        <Card className="col-span-12 xl:col-span-4">
          <CardHeader><CardTitle>Life categories</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-3">
            {c.categories.map((cat) => (
              <div key={cat.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className={cat.isFocus ? "text-foreground" : "text-muted-foreground"}>{cat.name}{cat.isFocus && " ·"}{cat.isFocus && <span className="text-subtle-foreground"> focus</span>}</span>
                  <span className="text-subtle-foreground tabular-nums">Lv {cat.level} · {cat.xp.toLocaleString("en-ZA")} XP</span>
                </div>
                <ProgressBar value={cumulativeProgress(cat.xp)} label={`${cat.name} progress`} className="h-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 md:col-span-6 xl:col-span-3">
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarRange className="size-3.5" /> Current season</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {data.season ? (
              <>
                <div className="text-sm font-medium">{data.season.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">Day {data.season.dayNumber} of {data.season.totalDays}</div>
                <ProgressBar value={data.season.dayNumber / data.season.totalDays} className="mt-3" label="Season progress" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active season. Ninety-day seasons arrive with the Life Seasons module.</p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-12 md:col-span-6 xl:col-span-3">
          <CardHeader><CardTitle className="flex items-center gap-2"><Gift className="size-3.5" /> Next reward</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {data.nextReward ? (
              <>
                <div className="text-sm font-medium">{data.nextReward.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {data.nextReward.creditsNeeded > 0 ? `${data.nextReward.creditsNeeded} more credits needed` : "You have enough credits"} · {data.nextReward.creditPrice} cr
                </div>
                <ProgressBar value={Math.min(1, c.credits / data.nextReward.creditPrice)} className="mt-3" label="Progress to next reward" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No rewards in the vault yet. Enjoyment belongs in the system too.</p>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-12 md:col-span-6 xl:col-span-3">
          <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="size-3.5" /> Upcoming milestones</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-3">
            {data.milestones.map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-xs"><span>{m.label}</span><span className="text-subtle-foreground tabular-nums">{Math.round(m.progress * 100)}%</span></div>
                <div className="mb-1 text-[11px] text-subtle-foreground">{m.detail}</div>
                <ProgressBar value={m.progress} className="h-1" label={m.label} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="col-span-12 md:col-span-6 xl:col-span-3">
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="size-3.5" /> Recent</CardTitle></CardHeader>
          <CardContent className="pt-3">
            {data.recentAchievements.length > 0 && (
              <ul className="mb-3 space-y-1.5">{data.recentAchievements.map((a) => <li key={a.id} className="text-sm">{a.name}</li>)}</ul>
            )}
            {data.recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your history starts with the first completed quest.</p>
            ) : (
              <ul className="space-y-2">
                {data.recentEvents.slice(0, 4).map((e) => (
                  <li key={e.id} className="text-xs">
                    <div className="truncate text-foreground">{e.title}</div>
                    <div className="text-subtle-foreground">{e.detail || formatDate(e.occurredAt.slice(0, 10), locale)}</div>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => navigate("/timeline")} className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Open timeline</button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Fraction of the way through the current level for a category's XP. */
function cumulativeProgress(xp: number) {
  const l = levelFromXp(xp);
  return l.xpIntoLevel / l.xpForNextLevel;
}

function WeeklyChart({ data }: { data: DashboardData["weeklyActivity"] }) {
  const rows = data.map((d) => ({ ...d, label: WEEKDAYS[new Date(`${d.date}T12:00:00Z`).getUTCDay()] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6b6e76", fontSize: 11 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#6b6e76", fontSize: 11 }} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#1b1d21", border: "1px solid #303238", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#9a9da5" }}
          itemStyle={{ color: "#f5f5f5" }}
          formatter={(v, name) => [v, name === "completed" ? "Quests" : "XP"]}
        />
        <Bar dataKey="completed" fill="#d4d4d8" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SavingsCard({ goal, currency, locale }: { goal: DashboardData["savingsGoal"]; currency: string; locale: string }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  return (
    <Card className="col-span-12 lg:col-span-6 xl:col-span-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PiggyBank className="size-3.5" /> Savings goal</CardTitle>
        {goal && <Button size="sm" variant="secondary" onClick={() => setDepositOpen(true)}>Record</Button>}
      </CardHeader>
      <CardContent className="pt-3">
        {goal ? (
          <>
            <div className="text-sm text-muted-foreground">{goal.name}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">
                <AnimatedNumber value={goal.savedCents} format={(n) => formatMoney(Math.round(n), currency, locale, { decimals: false })} />
              </span>
              <span className="text-sm text-muted-foreground">of {formatMoney(goal.targetCents, currency, locale)}</span>
            </div>
            <ProgressBar value={goal.savedCents / goal.targetCents} className="mt-4 h-2" label="Savings progress" />
            <div className="mt-2 flex justify-between text-xs text-subtle-foreground">
              <span>{Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100))}% · actual, confirmed balance</span>
              {goal.projectedCompletion && <span>Projection: {goal.projectedCompletion}</span>}
            </div>
            <SavingsEntryDialog open={depositOpen} onOpenChange={setDepositOpen} goalId={goal.id} currency={currency} />
          </>
        ) : (
          <>
            <EmptyState icon={PiggyBank} title="No savings goal" action={<Button size="sm" variant="secondary" onClick={() => setSetupOpen(true)}>Set one up</Button>}>
              Optional. Track real progress toward something that matters.
            </EmptyState>
            <SavingsSetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SavingsEntryDialog({ open, onOpenChange, goalId, currency }: { open: boolean; onOpenChange: (o: boolean) => void; goalId: number; currency: string }) {
  const entry = useSavingsEntry();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [desc, setDesc] = useState("");
  const cents = parseMoney(amount);
  const valid = cents !== null && Number.isFinite(cents) && cents > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record savings" description="Log money that has actually moved. LEVEL ONE never moves money itself.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            entry.mutate(
              { goalId, amountCents: direction === "in" ? cents : -cents, description: desc || undefined },
              { onSuccess: () => { onOpenChange(false); setAmount(""); setDesc(""); } },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
            {(["in", "out"] as const).map((d) => (
              <button type="button" key={d} role="radio" aria-checked={direction === d} onClick={() => setDirection(d)} className={`h-9 rounded-md border text-sm ${direction === d ? "border-accent bg-surface-3" : "border-border text-muted-foreground"}`}>
                {d === "in" ? "Deposit" : "Withdrawal"}
              </button>
            ))}
          </div>
          <Field label={`Amount (${currency})`} htmlFor="sv-amount" hint={amount && !valid ? "Enter a positive amount, e.g. 1500 or 1 500,50" : undefined}>
            <Input id="sv-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5 000" />
          </Field>
          <Field label="Note (optional)" htmlFor="sv-desc">
            <Input id="sv-desc" maxLength={200} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || entry.isPending}>Record</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SavingsSetupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateSavingsGoal();
  const [name, setName] = useState("First milestone");
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const [start, setStart] = useState("");
  const t = parseMoney(target);
  const m = parseMoney(monthly);
  const s = parseMoney(start);
  const valid = name.trim() && t !== null && Number.isFinite(t) && t > 0 && (m === null || (Number.isFinite(m) && m >= 0)) && (s === null || (Number.isFinite(s) && s >= 0));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New savings goal" description="Amounts are stored exactly, in cents. The starting balance is only used when no savings account exists yet.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || t === null) return;
            create.mutate({ name: name.trim(), targetCents: t, monthlyContributionCents: m, startingBalanceCents: s ?? undefined }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <Field label="Name" htmlFor="sg-name"><Input id="sg-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Target" htmlFor="sg-target"><Input id="sg-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="20 000" /></Field>
            <Field label="Monthly plan" htmlFor="sg-monthly"><Input id="sg-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="5 000" /></Field>
            <Field label="Saved so far" htmlFor="sg-start"><Input id="sg-start" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="6 000" /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || create.isPending}>Create goal</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-3.5" /> Quick actions</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 pt-3">
        <Button variant="secondary" size="sm" onClick={() => openQuestEditor()}>New quest</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate("/quests")}>Quest board</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate("/character")}>Character</Button>
        <Button variant="secondary" size="sm" onClick={() => navigate("/wealth")}>Savings</Button>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-16 w-96" />
      <div className="grid grid-cols-12 gap-4">
        <Skeleton className="col-span-6 h-36" />
        <Skeleton className="col-span-3 h-36" />
        <Skeleton className="col-span-3 h-36" />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Skeleton className="col-span-8 h-80" />
        <Skeleton className="col-span-4 h-80" />
      </div>
    </div>
  );
}
