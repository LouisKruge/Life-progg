import { useState } from "react";
import { BrainCircuit, CalendarRange, Gift, History, Landmark, Network, PiggyBank, Plus, Trophy } from "lucide-react";
import { useDashboard, useSavingsGoals, useSettings, useTimeline } from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError, RoadmapPage } from "./common";
import { SavingsEntryDialog, SavingsSetupDialog } from "./Dashboard";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

/** Savings goals are live now; budgets, debts and cash flow follow in phase 3. */
export function WealthPage() {
  const { data: goals, error, refetch } = useSavingsGoals();
  const { data: settings } = useSettings();
  const [setupOpen, setSetupOpen] = useState(false);
  const [entryGoal, setEntryGoal] = useState<number | null>(null);
  if (error) return <QueryError error={error} retry={refetch} />;
  const currency = settings?.currency ?? "ZAR";
  const locale = settings?.locale ?? "en-ZA";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wealth Center"
        title="Savings"
        description="Actual balances only count confirmed transactions you record. Projections are estimates and are always labelled as such."
        actions={<Button onClick={() => setSetupOpen(true)}><Plus /> Savings goal</Button>}
      />
      {!goals ? (
        <Skeleton className="h-40" />
      ) : goals.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No savings goals" action={<Button size="sm" onClick={() => setSetupOpen(true)}>Create one</Button>}>
          Financial tracking is optional. Add a goal when it's useful.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((g) => {
            const pct = g.savedCents / g.targetCents;
            return (
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle>{g.name}</CardTitle>
                  <Button size="sm" variant="secondary" onClick={() => setEntryGoal(g.id)}>Record</Button>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tabular-nums">{formatMoney(g.savedCents, currency, locale)}</span>
                    <span className="text-sm text-muted-foreground">of {formatMoney(g.targetCents, currency, locale)}</span>
                  </div>
                  <ProgressBar value={pct} className="mt-4 h-2" label={`${g.name} progress`} />
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                    <div><dt className="text-subtle-foreground">Actual</dt><dd className="mt-0.5 tabular-nums">{Math.min(100, Math.round(pct * 100))}%</dd></div>
                    <div><dt className="text-subtle-foreground">Monthly plan</dt><dd className="mt-0.5 tabular-nums">{g.monthlyContributionCents ? formatMoney(g.monthlyContributionCents, currency, locale) : "—"}</dd></div>
                    <div><dt className="text-subtle-foreground">Projection (estimate)</dt><dd className="mt-0.5">{g.savedCents >= g.targetCents ? "Reached" : g.projectedCompletion ?? "Set a monthly plan"}</dd></div>
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="size-3.5" /> Coming in phase 3</CardTitle></CardHeader>
        <CardContent className="pt-3 text-sm text-muted-foreground">
          Income and expenses, budgets, debts and repayments, recurring transactions, cash-flow and scenario projections, and the emergency fund tracker.
        </CardContent>
      </Card>
      <SavingsSetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
      {entryGoal !== null && <SavingsEntryDialog open onOpenChange={(o) => !o && setEntryGoal(null)} goalId={entryGoal} currency={currency} />}
    </div>
  );
}

interface RewardRow {
  id: number;
  name: string;
  description: string;
  category: string;
  creditPrice: number;
  estimatedCostCents: number;
  isDemo: boolean;
}

/** Read-only view of the vault until redemption, budgets and safeguards ship in phase 3. */
export function RewardsPage() {
  const { data: rewards } = useQuery({ queryKey: ["rewards"], queryFn: () => api.get<RewardRow[]>("/api/rewards") });
  const { data: dash } = useDashboard();
  const { data: settings } = useSettings();
  const credits = dash?.character.credits ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Rewards Vault · redemption in phase 3"
        title="Real-life rewards"
        description="Credits have no cash value. Paid rewards will need enough credits and enough of your monthly reward allowance, and never touch savings."
      />
      {!rewards ? (
        <Skeleton className="h-40" />
      ) : rewards.length === 0 ? (
        <EmptyState icon={Gift} title="The vault is empty">Rewards can be added once the full vault ships, or load the demo data from Settings to preview it.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {rewards.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.isDemo && <span className="text-[10px] tracking-wider text-subtle-foreground uppercase">Demo</span>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground capitalize">{r.category}</div>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-xl font-semibold tabular-nums">{r.creditPrice} cr</span>
                  <span className="text-xs text-subtle-foreground">{r.estimatedCostCents ? `≈ ${formatMoney(r.estimatedCostCents, settings?.currency, settings?.locale)}` : "Free"}</span>
                </div>
                <ProgressBar value={credits / r.creditPrice} className="mt-3 h-1" label={`Credits toward ${r.name}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function TimelinePage() {
  const { data, error, refetch } = useTimeline();
  const { data: settings } = useSettings();
  if (error) return <QueryError error={error} retry={refetch} />;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Timeline" title="Your history" description="The 50 most recent events. Filters and weekly, monthly and yearly views arrive in phase 4." />
      {!data ? (
        <Skeleton className="h-60" />
      ) : data.length === 0 ? (
        <EmptyState icon={History} title="Nothing here yet">Completed quests, level-ups and milestones will appear here.</EmptyState>
      ) : (
        <ol className="relative ml-3 border-l border-border">
          {data.map((e) => (
            <li key={e.id} className="relative pb-6 pl-6">
              <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border border-background bg-accent" />
              <div className="text-xs text-subtle-foreground">{formatDateTime(e.occurredAt, settings?.locale, settings?.timezone)}</div>
              <div className="mt-0.5 text-sm font-medium">{e.title}</div>
              {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export const SkillTreesPage = () => (
  <RoadmapPage icon={Network} phase={4} title="Skill Trees" summary="Six trees - Wealth, Physique, Mind, Empire, Life and Discipline - that grow from real accomplishments."
    features={["Node graph with zoom and pan", "Accessible list view", "Dependencies and unlock conditions", "Skill-specific XP from category quests", "Expandable node descriptions", "Milestone achievements"]} />
);
export const AchievementsPage = () => (
  <RoadmapPage icon={Trophy} phase={4} title="Achievement Vault" summary="Permanent achievements with explicit, testable unlock conditions."
    features={["First R20,000 saved", "R100,000 savings", "Thirty consistent days", "Debt-free milestone", "Tiers and rarity", "Optional evidence"]} />
);
export const SeasonsPage = () => (
  <RoadmapPage icon={CalendarRange} phase={4} title="Life Seasons" summary="Ninety-day seasons with three primary objectives. Seasons never reset lifetime XP, credits or records."
    features={["Season objectives and milestones", "Weekly reviews", "Progress charts", "End-of-season summary", "Personal celebration", "Archive in the timeline"]} />
);
export const StrategistPage = () => (
  <RoadmapPage icon={BrainCircuit} phase={5} title="AI Strategist" summary="An optional Claude-powered strategist that only sees the data you approve and never changes anything without confirmation."
    features={["Daily planning and weekly reviews", "Goal breakdown", "Mission suggestions", "Privacy panel", "Works without AI in planner mode", "API key kept server-side"]} />
);
