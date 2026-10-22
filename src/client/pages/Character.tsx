import { Coins, Flame, ScrollText, Target } from "lucide-react";
import { levelFromXp, cumulativeXpForLevel } from "@shared/types";
import { useCharacter, useLedger, useSettings } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, QueryError } from "./common";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  quest_completion: "Quest completed",
  quest_undo: "Completion undone",
  adjustment: "Adjustment",
  redemption: "Reward redeemed",
  refund: "Refund",
};

export function CharacterPage() {
  const { data: c, error, refetch } = useCharacter();
  const { data: ledger } = useLedger();
  const { data: settings } = useSettings();
  if (error) return <QueryError error={error} retry={refetch} />;
  if (!c || !settings) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Character" title={c.displayName} description="Lifetime XP is permanent. Credits are a separate, spendable wallet." />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <div className="grid size-24 place-items-center rounded-2xl border border-border bg-gradient-to-b from-surface-3 to-surface-2">
                <span className="text-4xl font-semibold tabular-nums">{c.level.level}</span>
              </div>
              <div className="flex-1">
                <div className="text-label">Rank</div>
                <div className="text-2xl font-semibold tracking-tight">{c.rank}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.nextRank ? `${c.nextRank.title} at level ${c.nextRank.minLevel}` : "Highest rank reached"}</div>
              </div>
            </div>
            <ProgressBar value={c.level.xpIntoLevel / c.level.xpForNextLevel} className="mt-6 h-2" label="Level progress" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>{c.level.xpIntoLevel.toLocaleString("en-ZA")} / {c.level.xpForNextLevel.toLocaleString("en-ZA")} XP</span>
              <span>Level {c.level.level + 1} at {cumulativeXpForLevel(c.level.level + 1).toLocaleString("en-ZA")} XP</span>
            </div>
          </CardContent>
        </Card>
        <div className="col-span-12 grid grid-cols-2 gap-4 xl:col-span-7 xl:grid-cols-4">
          <Stat icon={Flame} label="Lifetime XP" value={c.level.totalXp} />
          <Stat icon={Coins} label="Credits" value={c.credits} />
          <Stat icon={ScrollText} label="Quests done" value={c.stats.questsCompleted} />
          <Stat icon={Target} label="Active days" value={c.stats.activeDays} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 xl:col-span-5">
          <CardHeader><CardTitle>Category mastery</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-3">
            {c.categories.map((cat) => {
              const l = levelFromXp(cat.xp);
              return (
                <div key={cat.id}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-sm font-medium">{cat.name}{cat.isFocus && <span className="ml-2 text-[10px] tracking-wider text-subtle-foreground uppercase">Focus</span>}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">Lv {l.level} · {cat.xp.toLocaleString("en-ZA")} XP</span>
                  </div>
                  <ProgressBar value={l.xpIntoLevel / l.xpForNextLevel} label={`${cat.name} level progress`} />
                  <div className="mt-1 text-[11px] text-subtle-foreground">{cat.description}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="col-span-12 xl:col-span-7">
          <CardHeader><CardTitle>XP &amp; credit history</CardTitle><span className="text-xs text-muted-foreground">Every change is recorded</span></CardHeader>
          <CardContent className="pt-3">
            {!ledger ? (
              <Skeleton className="h-40" />
            ) : ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions yet. Complete a quest to start your history.</p>
            ) : (
              <ul tabIndex={0} aria-label="XP and credit history" className="max-h-[480px] divide-y divide-border/60 overflow-y-auto pr-2">
                {ledger.map((r) => (
                  <li key={`${r.ledger}-${r.id}`} className="flex items-center gap-4 py-2.5 text-sm">
                    <span className={cn("w-16 shrink-0 text-right font-medium tabular-nums", r.amount < 0 ? "text-muted-foreground" : "text-foreground")}>
                      {r.amount > 0 ? "+" : ""}{r.amount} {r.ledger === "xp" ? "XP" : "cr"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.note || SOURCE_LABEL[r.sourceType]}</span>
                    <span className="shrink-0 text-xs text-subtle-foreground">{SOURCE_LABEL[r.sourceType] ?? r.sourceType}</span>
                    <span className="w-28 shrink-0 text-right text-xs text-subtle-foreground">{formatDateTime(r.createdAt, settings.locale, settings.timezone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {settings.mainGoals.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Main life goals</CardTitle></CardHeader>
          <CardContent className="pt-3">
            <ul className="grid gap-2 sm:grid-cols-2">
              {settings.mainGoals.map((g) => <li key={g} className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">{g}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-label flex items-center gap-2"><Icon className="size-3.5" />{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums"><AnimatedNumber value={value} /></div>
      </CardContent>
    </Card>
  );
}
