import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { financialTransactions, lifeCategories, questCompletions, questInstances, quests } from "../db/schema.js";
import type { PlannerOutput, QuestDifficulty } from "../../shared/types.js";
import { addDays, dateInTimezone, weekday } from "../domain/dates.js";
import { listInstancesForDate } from "./quests.js";
import { listAccounts } from "./wealth.js";
import { activeSavingsGoal } from "./savings.js";
import { getSettings, today } from "./settings.js";
import { computeMetrics } from "./metrics.js";

// The planner works with no AI and no network. It only reports what the data shows and offers
// suggestions labelled as such; it never claims anything happened that wasn't recorded.

const ORDER: Record<QuestDifficulty, number> = { epic: 0, hard: 1, medium: 2, easy: 3, trivial: 4 };

const REFLECTION_PROMPTS = [
  "What gave you energy this week, and how can you get more of it?",
  "Which task did you avoid, and what is the smallest first step on it?",
  "What would make next week feel lighter rather than busier?",
  "Where did you make progress that nobody else noticed?",
  "What is one thing you can stop doing?",
  "When did you last enjoy something without earning it first? Plan the next one.",
  "Which of your quests still matters, and which is just habit?",
  "What would future you thank you for starting this week?",
];

export function runPlanner(ctx: AppContext): PlannerOutput {
  const settings = getSettings(ctx);
  const date = today(ctx);
  const board = listInstancesForDate(ctx, date);
  const pending = board.filter((q) => q.status === "pending" && !q.quest.isOptional).sort((a, b) => ORDER[a.quest.difficulty] - ORDER[b.quest.difficulty]);
  const isRestDay = settings.restDays.includes(weekday(date));

  // ---- Daily plan
  const steps: string[] = [];
  if (pending[0]) steps.push(`Start with “${pending[0].quest.title}” while energy is high (+${pending[0].quest.xpReward} XP).`);
  if (pending.length > 2) steps.push(`Batch the ${pending.length - 1} smaller quests into one or two focused blocks.`);
  else if (pending[1]) steps.push(`Then “${pending[1].quest.title}”.`);
  const goal = activeSavingsGoal(ctx);
  if (goal && goal.savedCents < goal.targetCents) steps.push(`Check in on “${goal.name}”: ${Math.round((goal.savedCents / goal.targetCents) * 100)}% there (actual, confirmed balance).`);
  steps.push("Leave room for something you enjoy today. It is part of the plan, not a reward for finishing it.");
  const required = board.filter((q) => !q.quest.isOptional).length;
  const workloadNote =
    settings.dailyQuestLimit !== null && required > settings.dailyQuestLimit && pending.length > 0
      ? `Today has ${required} required quests, above your limit of ${settings.dailyQuestLimit}. Skipping one is penalty-free.`
      : isRestDay
        ? "Rest day: daily quests are paused."
        : null;
  const headline = isRestDay && pending.length === 0 ? "Rest day. Recover properly." : pending.length === 0 ? "Everything required today is done." : `${pending.length} required quest${pending.length === 1 ? "" : "s"} left today.`;

  // ---- Weekly review (last 7 days, including today)
  const since = addDays(date, -6);
  const sinceIso = `${addDays(since, -1)}T00:00:00.000Z`;
  const cats = new Map(ctx.store.db.select().from(lifeCategories).all().map((c) => [c.id, c.name]));
  const done = ctx.store.db
    .select({ at: questCompletions.completedAt, xp: questCompletions.xpAwarded, cat: questCompletions.categoryId })
    .from(questCompletions)
    .where(and(isNull(questCompletions.undoneAt), gte(questCompletions.completedAt, sinceIso)))
    .all()
    .filter((c) => dateInTimezone(new Date(c.at), settings.timezone) >= since);
  const byCat = new Map<string, number>();
  for (const c of done) if (c.cat) byCat.set(cats.get(c.cat) ?? "Other", (byCat.get(cats.get(c.cat) ?? "Other") ?? 0) + 1);
  const skipped = Number(
    ctx.store.db.select({ n: sql<number>`COUNT(*)` }).from(questInstances).where(and(eq(questInstances.status, "skipped"), gte(questInstances.scheduledDate, since))).get()?.n ?? 0,
  );
  const protectedIds = listAccounts(ctx).filter((a) => a.isProtected).map((a) => a.id);
  const savingsChange = protectedIds.length
    ? Number(
        ctx.store.db
          .select({ t: sql<number>`COALESCE(SUM(${financialTransactions.amountCents}), 0)` })
          .from(financialTransactions)
          .where(and(eq(financialTransactions.status, "confirmed"), gte(financialTransactions.occurredOn, since), sql`${financialTransactions.accountId} IN (${sql.join(protectedIds.map((i) => sql`${i}`), sql`, `)})`))
          .get()?.t ?? 0,
      )
    : 0;
  const activeDays = new Set(done.map((c) => dateInTimezone(new Date(c.at), settings.timezone))).size;
  const observations: string[] = [];
  if (done.length === 0) observations.push("No quests were completed in the last 7 days. Restart small: one easy quest tomorrow is enough.");
  else observations.push(`${done.length} quests on ${activeDays} of 7 days.`);
  if (activeDays >= 5) observations.push("Strong consistency. Protect it by keeping the daily load sustainable.");
  if (skipped > 3) observations.push(`${skipped} quests were skipped. Some may be too big or no longer relevant; consider resizing or archiving them.`);
  const focus = ctx.store.db.select().from(lifeCategories).where(eq(lifeCategories.isFocus, true)).all();
  const neglected = focus.filter((f) => !byCat.has(f.name)).map((f) => f.name);
  if (neglected.length) observations.push(`No progress this week in your focus area${neglected.length > 1 ? "s" : ""}: ${neglected.join(", ")}.`);

  // ---- Suggestions (each one can become a quest with one click)
  const suggestions: PlannerOutput["suggestions"] = [];
  const activeQuestCats = new Set(ctx.store.db.select({ c: quests.categoryId }).from(quests).where(eq(quests.status, "active")).all().map((r) => r.c));
  for (const f of focus) {
    if (!activeQuestCats.has(f.id)) {
      suggestions.push({ title: SUGGESTED_TITLE[f.key] ?? `A small ${f.name} habit`, reason: `${f.name} is a focus area but has no active quests.`, difficulty: "easy", frequency: "daily", categoryKey: f.key });
    }
  }
  if (goal && goal.savedCents < goal.targetCents && !goal.monthlyContributionCents) {
    suggestions.push({ title: "Set a monthly savings amount", reason: `“${goal.name}” has no monthly plan, so no projection is possible.`, difficulty: "easy", frequency: "once", categoryKey: "wealth" });
  }
  const m = computeMetrics(ctx);
  if (m.questsCompleted > 0 && !ctx.store.db.select({ id: quests.id }).from(quests).where(and(eq(quests.status, "active"), eq(quests.frequency, "weekly"))).get()) {
    suggestions.push({ title: "Weekly review", reason: "A short weekly check-in keeps quests and goals relevant.", difficulty: "medium", frequency: "weekly", categoryKey: "discipline" });
  }
  if (settings.restDays.length === 0 && m.activeDays >= 6) {
    suggestions.push({ title: "Choose a rest day", reason: "You have no rest days configured. Recovery is part of sustainable progress (Settings → Quests).", difficulty: "trivial", frequency: "once", categoryKey: "life" });
  }

  const dayIndex = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
  const reflectionPrompts = [0, 1, 2].map((i) => REFLECTION_PROMPTS[(dayIndex + i) % REFLECTION_PROMPTS.length]!);

  return {
    dailyPlan: { headline, steps, workloadNote },
    weeklyReview: {
      completed: done.length,
      xp: done.reduce((s, c) => s + c.xp, 0),
      activeDays,
      skipped,
      topCategories: [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
      savingsChangeCents: savingsChange,
      observations,
    },
    suggestions: suggestions.slice(0, 5),
    reflectionPrompts,
  };
}

const SUGGESTED_TITLE: Record<string, string> = {
  wealth: "Check balances for 5 minutes",
  physique: "Move for 20 minutes",
  mind: "Read 10 pages",
  empire: "One focused hour on the business",
  life: "Message someone you care about",
  discipline: "Plan tomorrow tonight",
};
