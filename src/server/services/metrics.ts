import { eq, isNull, ne, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { debts, financialAccounts, lifeCategories, questCompletions, rewardRedemptions, seasons, xpTransactions } from "../db/schema.js";
import { levelFromXp } from "../../shared/types.js";
import { addDays, dateInTimezone } from "../domain/dates.js";
import { accountBalance } from "./savings.js";
import { getSettings } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";

/**
 * Verifiable facts about the user's progress, computed from the database only.
 * Achievements and skill nodes are defined as thresholds on these numbers, which keeps
 * every unlock condition explicit and testable.
 */
export interface Metrics {
  questsCompleted: number;
  totalXp: number;
  level: number;
  categoryXp: Record<string, number>;
  categoryQuests: Record<string, number>;
  savingsTotalCents: number;
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  debtsPaidOff: number;
  debtFree: number;
  rewardsRedeemed: number;
  seasonsCompleted: number;
}

export type ConditionType =
  | "quests_completed"
  | "total_xp"
  | "level"
  | "category_xp"
  | "category_quests"
  | "savings_total"
  | "active_days"
  | "streak_days"
  | "debts_paid_off"
  | "debt_free"
  | "rewards_redeemed"
  | "seasons_completed"
  | "manual";

/** Longest and current runs of consecutive calendar days in a sorted, de-duplicated list of dates. */
export function streaks(days: string[], today: string): { longest: number; current: number } {
  const set = new Set(days);
  let longest = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // not the start of a run
    let len = 1;
    while (set.has(addDays(d, len))) len++;
    longest = Math.max(longest, len);
  }
  // The current streak may end today or yesterday (today isn't over yet).
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { longest, current };
}

export function computeMetrics(ctx: AppContext): Metrics {
  const db = ctx.store.db;
  const { timezone } = getSettings(ctx);
  const cats = db.select().from(lifeCategories).all();
  const keyById = new Map(cats.map((c) => [c.id, c.key]));

  const live = db
    .select({ completedAt: questCompletions.completedAt, categoryId: questCompletions.categoryId })
    .from(questCompletions)
    .where(isNull(questCompletions.undoneAt))
    .all();
  const days = [...new Set(live.map((c) => dateInTimezone(new Date(c.completedAt), timezone)))];
  const { longest, current } = streaks(days, dateInTimezone(ctx.clock.now(), timezone));

  const categoryQuests: Record<string, number> = Object.fromEntries(cats.map((c) => [c.key, 0]));
  for (const c of live) {
    const key = c.categoryId ? keyById.get(c.categoryId) : undefined;
    if (key) categoryQuests[key] = (categoryQuests[key] ?? 0) + 1;
  }

  const categoryXp: Record<string, number> = Object.fromEntries(cats.map((c) => [c.key, 0]));
  for (const r of db.select({ id: xpTransactions.categoryId, xp: sql<number>`SUM(${xpTransactions.amount})` }).from(xpTransactions).groupBy(xpTransactions.categoryId).all()) {
    const key = r.id ? keyById.get(r.id) : undefined;
    if (key) categoryXp[key] = Math.max(0, Number(r.xp));
  }

  const totalXp = Math.max(0, Number(db.select({ t: sql<number>`COALESCE(SUM(${xpTransactions.amount}), 0)` }).from(xpTransactions).get()?.t ?? 0));
  const protectedAccounts = db.select({ id: financialAccounts.id }).from(financialAccounts).where(eq(financialAccounts.isProtected, true)).all();
  const allDebts = db.select({ status: debts.status }).from(debts).where(ne(debts.status, "archived")).all();
  const paidOff = allDebts.filter((d) => d.status === "paid_off").length;

  return {
    questsCompleted: live.length,
    totalXp,
    level: levelFromXp(totalXp).level,
    categoryXp,
    categoryQuests,
    savingsTotalCents: protectedAccounts.reduce((s, a) => s + accountBalance(ctx, a.id), 0),
    activeDays: days.length,
    longestStreak: longest,
    currentStreak: current,
    debtsPaidOff: paidOff,
    debtFree: allDebts.length > 0 && paidOff === allDebts.length ? 1 : 0,
    rewardsRedeemed: Number(db.select({ n: sql<number>`COUNT(*)` }).from(rewardRedemptions).where(ne(rewardRedemptions.status, "cancelled")).get()?.n ?? 0),
    // Archiving a completed season keeps it counted: completion is a permanent fact.
    seasonsCompleted: Number(db.select({ n: sql<number>`COUNT(*)` }).from(seasons).where(sql`${seasons.completedAt} IS NOT NULL`).get()?.n ?? 0),
  };
}

export function metricValue(m: Metrics, type: ConditionType | string, key: string | null): number {
  switch (type) {
    case "quests_completed":
      return m.questsCompleted;
    case "total_xp":
      return m.totalXp;
    case "level":
      return m.level;
    case "category_xp":
      return m.categoryXp[key ?? ""] ?? 0;
    case "category_quests":
      return m.categoryQuests[key ?? ""] ?? 0;
    case "savings_total":
      return m.savingsTotalCents;
    case "active_days":
      return m.activeDays;
    case "streak_days":
      return m.longestStreak;
    case "debts_paid_off":
      return m.debtsPaidOff;
    case "debt_free":
      return m.debtFree;
    case "rewards_redeemed":
      return m.rewardsRedeemed;
    case "seasons_completed":
      return m.seasonsCompleted;
    default:
      return 0;
  }
}

export function conditionMet(m: Metrics, type: string, value: number, key: string | null): boolean {
  return type !== "manual" && metricValue(m, type, key) >= value;
}

export function conditionProgress(m: Metrics, type: string, value: number, key: string | null): number {
  if (type === "manual" || value <= 0) return 0;
  return Math.min(1, metricValue(m, type, key) / value);
}

const CATEGORY_NAME: Record<string, string> = { wealth: "Wealth", physique: "Physique", mind: "Mind", empire: "Empire", life: "Life", discipline: "Discipline" };

/** Human-readable condition, e.g. "Complete 10 Physique quests". */
export function describeCondition(type: string, value: number, key: string | null, money: (cents: number) => string): string {
  const cat = CATEGORY_NAME[key ?? ""] ?? key ?? "";
  switch (type) {
    case "quests_completed":
      return value === 1 ? "Complete your first quest" : `Complete ${value} quests`;
    case "total_xp":
      return `Earn ${value.toLocaleString("en-ZA")} lifetime XP`;
    case "level":
      return `Reach level ${value}`;
    case "category_xp":
      return `Earn ${value.toLocaleString("en-ZA")} ${cat} XP`;
    case "category_quests":
      return value === 1 ? `Complete a ${cat} quest` : `Complete ${value} ${cat} quests`;
    case "savings_total":
      return `Have ${money(value)} in protected savings`;
    case "active_days":
      return `Be active on ${value} different days`;
    case "streak_days":
      return `Complete a quest on ${value} consecutive days`;
    case "debts_paid_off":
      return value === 1 ? "Pay off a debt in full" : `Pay off ${value} debts`;
    case "debt_free":
      return "Pay off every tracked debt";
    case "rewards_redeemed":
      return value === 1 ? "Redeem your first reward" : `Redeem ${value} rewards`;
    case "seasons_completed":
      return value === 1 ? "Complete a ninety-day season" : `Complete ${value} seasons`;
    case "manual":
      return "Confirmed by you when it happens";
    default:
      return type;
  }
}

/** Records a point-in-time progress snapshot on the timeline, so the past can be compared with now. */
export function takeSnapshot(ctx: AppContext, label = "Progress snapshot"): number {
  const m = computeMetrics(ctx);
  const data = { level: m.level, totalXp: m.totalXp, questsCompleted: m.questsCompleted, savingsTotalCents: m.savingsTotalCents, longestStreak: m.longestStreak, categoryXp: m.categoryXp };
  return addTimelineEvent(ctx, { type: "snapshot", title: label, detail: `Level ${m.level} · ${m.totalXp.toLocaleString("en-ZA")} XP · ${m.questsCompleted} quests`, data });
}
