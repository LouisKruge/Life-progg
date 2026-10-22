import { Coins, Plus, Search } from "lucide-react";
import { useDashboard, useSettings } from "@/lib/queries";
import { formatLongDate } from "@/lib/format";
import { openQuestEditor, paletteStore } from "@/lib/ui-state";
import { ProgressBar } from "@/components/ui/progress";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const { data } = useDashboard();
  const { data: settings } = useSettings();
  const c = data?.character;
  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b border-border bg-background/80 px-8 backdrop-blur">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{data ? formatLongDate(data.today, settings?.locale) : " "}</div>
        <div className="text-[11px] text-subtle-foreground">{settings?.timezone}</div>
      </div>

      <div className="ml-auto flex items-center gap-6">
        {c && (
          <div className="flex items-center gap-3" aria-label={`Level ${c.level.level}, ${c.level.xpIntoLevel} of ${c.level.xpForNextLevel} XP`}>
            <div className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-sm font-semibold tabular-nums">{c.level.level}</div>
            <div className="w-44">
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{c.rank}</span>
                <span className="tabular-nums">
                  <AnimatedNumber value={c.level.xpIntoLevel} /> / {c.level.xpForNextLevel.toLocaleString("en-ZA")} XP
                </span>
              </div>
              <ProgressBar value={c.level.xpIntoLevel / c.level.xpForNextLevel} label="Level progress" />
            </div>
          </div>
        )}
        {c && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5" title="Credits have no monetary value">
            <Coins className="size-4 text-accent" strokeWidth={1.75} />
            <span className="text-sm font-semibold tabular-nums">
              <AnimatedNumber value={c.credits} />
            </span>
            <span className="text-[11px] text-muted-foreground">credits</span>
          </div>
        )}
        <Button variant="ghost" size="icon" aria-label="Open command palette" onClick={() => paletteStore.set(true)}>
          <Search />
        </Button>
        <Button onClick={() => openQuestEditor()} aria-label="Quick add quest">
          <Plus /> Quest
        </Button>
      </div>
    </header>
  );
}
