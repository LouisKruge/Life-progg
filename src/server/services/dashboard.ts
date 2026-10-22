import { and, asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { achievementUnlocks, achievements, rewards, seasons } from "../db/schema.js";
import { cumulativeXpForLevel, type DashboardData, type QuestInstanceView } from "../../shared/types.js";
import { addDays, daysBetween, weekday } from "../domain/dates.js";
import { getCharacter } from "./progression.js";
import { countActiveDailyQuests, listInstancesForDate, weeklyActivity } from "./quests.js";
import { activeSavingsGoal } from "./savings.js";
import { getSettings, today } from "./settings.js";
import { recentEvents } from "./timeline.js";
import { listAchievements } from "./achievements.js";
import { todaysAiFocus } from "./strategist.js";

const DIFFICULTY_ORDER = { epic: 0, hard: 1, medium: 2, easy: 3, trivial: 4 } as const;

/**
 * Rule-based daily focus used when the AI strategist is off. It only describes real data
 * and makes suggestions; it never claims anything was done.
 */
export function plannerFocus(
  quests: QuestInstanceView[],
  isRestDay: boolean,
  savings: DashboardData["savingsGoal"],
): DashboardData["focus"] {
  const pending = quests.filter((q) => q.status === "pending");
  const required = pending.filter((q) => !q.quest.isOptional);
  if (isRestDay && pending.length === 0) {
    return { source: "planner", headline: "Rest day. Recovery is part of the system.", points: ["Nothing is scheduled. Enjoy it without guilt."] };
  }
  if (quests.length === 0) {
    return { source: "planner", headline: "Your board is empty.", points: ["Add one or two small quests to get momentum going."] };
  }
  if (pending.length === 0) {
    return { source: "planner", headline: "Everything for today is done.", points: ["The rest of the day is yours. Consider a reward from the vault."] };
  }
  const top = [...required].sort((a, b) => DIFFICULTY_ORDER[a.quest.difficulty] - DIFFICULTY_ORDER[b.quest.difficulty])[0];
  const points: string[] = [];
  if (top) points.push(`Start with "${top.quest.title}" - it carries the most weight today (+${top.quest.xpReward} XP).`);
  if (required.length > 1) points.push(`${required.length - 1} other required quest${required.length > 2 ? "s" : ""} after that.`);
  if (savings && savings.savedCents < savings.targetCents && savings.monthlyContributionCents) {
    points.push(`Savings: ${Math.round((savings.savedCents / savings.targetCents) * 100)}% of "${savings.name}" - keep the monthly contribution on track.`);
  }
  return { source: "planner", headline: `${pending.length} quest${pending.length === 1 ? "" : "s"} left today.`, points };
}

export function getDashboard(ctx: AppContext): DashboardData {
  const settings = getSettings(ctx);
  const date = today(ctx);
  const character = getCharacter(ctx);
  const questsToday = listInstancesForDate(ctx, date);
  const isRestDay = settings.restDays.includes(weekday(date));

  const counted = questsToday.filter((q) => !q.quest.isOptional && q.status !== "skipped");
  const done = counted.filter((q) => q.status === "completed").length;
  const activeDaily = countActiveDailyQuests(ctx);

  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i - 6));
  const savingsGoal = activeSavingsGoal(ctx);

  const season = ctx.store.db.select().from(seasons).where(eq(seasons.status, "active")).orderBy(desc(seasons.startDate)).get();

  const unlocks = ctx.store.db
    .select({ id: achievements.id, name: achievements.name, tier: achievements.tier, unlockedAt: achievementUnlocks.unlockedAt })
    .from(achievementUnlocks)
    .innerJoin(achievements, eq(achievementUnlocks.achievementId, achievements.id))
    .orderBy(desc(achievementUnlocks.unlockedAt))
    .limit(3)
    .all();

  const activeRewards = ctx.store.db
    .select()
    .from(rewards)
    .where(and(eq(rewards.status, "active")))
    .orderBy(asc(rewards.creditPrice))
    .all();
  // Next reward: the cheapest one still out of reach, or the priciest affordable one if all are affordable.
  const target = activeRewards.find((r) => r.creditPrice > character.credits) ?? activeRewards.at(-1);

  const milestones: DashboardData["milestones"] = [];
  const lvl = character.level;
  milestones.push({
    label: `Level ${lvl.level + 1}`,
    detail: `${lvl.xpForNextLevel - lvl.xpIntoLevel} XP to go (${cumulativeXpForLevel(lvl.level + 1)} total)`,
    progress: lvl.xpIntoLevel / lvl.xpForNextLevel,
  });
  if (character.nextRank) {
    milestones.push({
      label: `Rank: ${character.nextRank.title}`,
      detail: `Unlocks at level ${character.nextRank.minLevel}`,
      progress: Math.min(1, lvl.level / character.nextRank.minLevel),
    });
  }
  if (savingsGoal) {
    milestones.push({
      label: savingsGoal.name,
      detail: savingsGoal.projectedCompletion ? `Projected ${savingsGoal.projectedCompletion} at the planned rate` : "Set a monthly contribution to see a projection",
      progress: Math.min(1, savingsGoal.savedCents / savingsGoal.targetCents),
    });
  }

  // The closest automatic achievement still to earn, so the next milestone is always visible.
  const nextAchievement = listAchievements(ctx)
    .filter((a) => !a.unlockedAt && !a.condition.startsWith("Confirmed"))
    .sort((a, b) => b.progress - a.progress)[0];
  if (nextAchievement) milestones.push({ label: nextAchievement.name, detail: nextAchievement.condition, progress: nextAchievement.progress });

  const aiFocus = todaysAiFocus(ctx);

  return {
    today: date,
    isRestDay,
    character,
    quests: questsToday,
    completion: { done, total: counted.length, percent: counted.length ? Math.round((done / counted.length) * 100) : 0 },
    workload: { activeDailyQuests: activeDaily, limit: settings.dailyQuestLimit, overLimit: settings.dailyQuestLimit !== null && activeDaily > settings.dailyQuestLimit },
    weeklyActivity: weeklyActivity(ctx, days),
    savingsGoal,
    season: season
      ? {
          id: season.id,
          name: season.name,
          startDate: season.startDate,
          endDate: season.endDate,
          dayNumber: Math.max(1, daysBetween(season.startDate, date) + 1),
          totalDays: daysBetween(season.startDate, season.endDate) + 1,
        }
      : null,
    recentAchievements: unlocks,
    nextReward: target ? { id: target.id, name: target.name, creditPrice: target.creditPrice, creditsNeeded: Math.max(0, target.creditPrice - character.credits) } : null,
    milestones,
    focus: aiFocus ? { source: "ai", ...aiFocus } : plannerFocus(questsToday, isRestDay, savingsGoal),
    recentEvents: recentEvents(ctx, 6),
  };
}
