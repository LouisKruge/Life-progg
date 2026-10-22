import { asc, eq, isNull } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { achievements, achievementUnlocks, skillNodes, skillProgress } from "../db/schema.js";
import type { AchievementCategory, AchievementTier, AchievementView } from "../../shared/types.js";
import { conflict, notFound } from "../errors.js";
import { computeMetrics, conditionMet, conditionProgress, describeCondition, type ConditionType, type Metrics } from "./metrics.js";
import { getSettings } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  conditionType: ConditionType;
  conditionValue: number;
  conditionKey?: string;
}

/** Built-in achievements. Every condition is a threshold on a verifiable metric (see metrics.ts). */
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_quest", name: "First Step", description: "The first completed quest. Everything starts here.", icon: "footprints", category: "discipline", tier: "bronze", conditionType: "quests_completed", conditionValue: 1 },
  { key: "quests_50", name: "Momentum", description: "Fifty quests completed.", icon: "zap", category: "discipline", tier: "silver", conditionType: "quests_completed", conditionValue: 50 },
  { key: "quests_250", name: "Relentless", description: "Two hundred and fifty quests completed.", icon: "flame", category: "discipline", tier: "gold", conditionType: "quests_completed", conditionValue: 250 },
  { key: "streak_7", name: "Seven Straight", description: "A quest completed every day for a week.", icon: "calendar-check", category: "discipline", tier: "bronze", conditionType: "streak_days", conditionValue: 7 },
  { key: "streak_30", name: "Thirty Consistent Days", description: "Thirty consecutive days of showing up.", icon: "calendar-range", category: "discipline", tier: "gold", conditionType: "streak_days", conditionValue: 30 },
  { key: "savings_20k", name: "First R20,000 Saved", description: "Twenty thousand rand in protected savings.", icon: "piggy-bank", category: "wealth", tier: "silver", conditionType: "savings_total", conditionValue: 2_000_000 },
  { key: "savings_100k", name: "R100,000 Savings", description: "A six-figure safety net.", icon: "landmark", category: "wealth", tier: "platinum", conditionType: "savings_total", conditionValue: 10_000_000 },
  { key: "first_debt_paid", name: "Chain Breaker", description: "A debt paid off in full.", icon: "unlink", category: "wealth", tier: "silver", conditionType: "debts_paid_off", conditionValue: 1 },
  { key: "debt_free", name: "Debt-Free Milestone", description: "Every tracked debt paid off.", icon: "shield-check", category: "wealth", tier: "platinum", conditionType: "debt_free", conditionValue: 1 },
  { key: "fitness_10", name: "In Motion", description: "Ten Physique quests completed.", icon: "dumbbell", category: "fitness", tier: "bronze", conditionType: "category_quests", conditionValue: 10, conditionKey: "physique" },
  { key: "fitness_100", name: "Built Different", description: "One hundred Physique quests completed.", icon: "medal", category: "fitness", tier: "gold", conditionType: "category_quests", conditionValue: 100, conditionKey: "physique" },
  { key: "learning_25", name: "Student of Life", description: "Twenty-five Mind quests completed.", icon: "book-open", category: "learning", tier: "silver", conditionType: "category_quests", conditionValue: 25, conditionKey: "mind" },
  { key: "business_25", name: "Builder", description: "Twenty-five Empire quests completed.", icon: "briefcase", category: "business", tier: "silver", conditionType: "category_quests", conditionValue: 25, conditionKey: "empire" },
  { key: "life_10", name: "Present", description: "Ten Life quests: people, home and adventure.", icon: "heart", category: "personal", tier: "bronze", conditionType: "category_quests", conditionValue: 10, conditionKey: "life" },
  { key: "first_reward", name: "Enjoyment Counts", description: "Your first redeemed reward. Enjoyment is part of the system.", icon: "gift", category: "personal", tier: "bronze", conditionType: "rewards_redeemed", conditionValue: 1 },
  { key: "level_5", name: "Apprentice", description: "Reached level 5.", icon: "chevrons-up", category: "milestone", tier: "bronze", conditionType: "level", conditionValue: 5 },
  { key: "level_10", name: "Builder Rank", description: "Reached level 10.", icon: "crown", category: "milestone", tier: "silver", conditionType: "level", conditionValue: 10 },
  { key: "level_20", name: "Architect Rank", description: "Reached level 20.", icon: "gem", category: "milestone", tier: "gold", conditionType: "level", conditionValue: 20 },
  { key: "first_season", name: "Season One", description: "A full ninety-day season completed.", icon: "flag", category: "milestone", tier: "gold", conditionType: "seasons_completed", conditionValue: 1 },
  // Real-world milestones the app can't observe: confirmed manually by the user, with optional evidence.
  { key: "first_project", name: "First Completed Project", description: "Shipped something real from start to finish.", icon: "rocket", category: "business", tier: "gold", conditionType: "manual", conditionValue: 0 },
  { key: "strength_record", name: "New Strength Record", description: "Set a new personal best.", icon: "trophy", category: "fitness", tier: "silver", conditionType: "manual", conditionValue: 0 },
  { key: "first_customer", name: "First Business Customer", description: "Someone paid for what you built.", icon: "handshake", category: "business", tier: "platinum", conditionType: "manual", conditionValue: 0 },
];

/** Upserts built-in definitions (names and conditions can evolve between versions; unlocks never change). */
export function seedAchievements(ctx: AppContext): void {
  ACHIEVEMENTS.forEach((a, i) => {
    const values = { ...a, conditionKey: a.conditionKey ?? null, isCustom: false, sortOrder: i };
    ctx.store.db.insert(achievements).values(values).onConflictDoUpdate({ target: achievements.key, set: values }).run();
  });
}

function money(ctx: AppContext) {
  const { currency, locale } = getSettings(ctx);
  return (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

/**
 * Unlocks every automatic achievement whose condition is now met. Unlocks are permanent:
 * a later undo never removes them. Returns the keys unlocked by this call.
 */
export function evaluateAchievements(ctx: AppContext, metrics: Metrics = computeMetrics(ctx)): string[] {
  const unlocked = new Set(ctx.store.db.select({ id: achievementUnlocks.achievementId }).from(achievementUnlocks).all().map((u) => u.id));
  const out: string[] = [];
  for (const a of ctx.store.db.select().from(achievements).all()) {
    if (unlocked.has(a.id) || a.isCustom || !conditionMet(metrics, a.conditionType, a.conditionValue, a.conditionKey)) continue;
    ctx.store.db.insert(achievementUnlocks).values({ achievementId: a.id, unlockedAt: ctx.clock.now().toISOString() }).onConflictDoNothing().run();
    addTimelineEvent(ctx, { type: "achievement", title: `Achievement unlocked: ${a.name}`, detail: a.description, sourceType: "achievement", sourceId: a.id });
    out.push(a.key);
  }
  return out;
}

export function listAchievements(ctx: AppContext): AchievementView[] {
  const metrics = computeMetrics(ctx);
  const fmt = money(ctx);
  const unlocks = new Map(ctx.store.db.select().from(achievementUnlocks).all().map((u) => [u.achievementId, u]));
  return ctx.store.db
    .select()
    .from(achievements)
    .orderBy(asc(achievements.sortOrder), asc(achievements.id))
    .all()
    .map((a) => {
      const u = unlocks.get(a.id);
      return {
        id: a.id,
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category as AchievementCategory,
        tier: a.tier,
        condition: describeCondition(a.conditionType, a.conditionValue, a.conditionKey, fmt),
        isCustom: a.isCustom,
        progress: u ? 1 : conditionProgress(metrics, a.conditionType, a.conditionValue, a.conditionKey),
        unlockedAt: u?.unlockedAt ?? null,
        evidence: u?.evidence ?? "",
      };
    });
}

export function createCustomAchievement(
  ctx: AppContext,
  input: { name: string; description: string; category: AchievementCategory; tier: AchievementTier; icon?: string },
): AchievementView {
  const key = `custom_${ctx.clock.now().getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const row = ctx.store.db
    .insert(achievements)
    .values({ key, name: input.name, description: input.description, category: input.category, tier: input.tier, icon: input.icon ?? "star", conditionType: "manual", conditionValue: 0, isCustom: true, sortOrder: 1000 })
    .returning()
    .get();
  return listAchievements(ctx).find((a) => a.id === row.id)!;
}

/** Manually unlocks a "manual" achievement, recording optional evidence. Automatic ones can't be forced. */
export function unlockManually(ctx: AppContext, id: number, evidence: string): AchievementView {
  return ctx.store.tx(() => {
    const a = ctx.store.db.select().from(achievements).where(eq(achievements.id, id)).get();
    if (!a) throw notFound("Achievement");
    if (a.conditionType !== "manual") throw conflict("AUTOMATIC_ACHIEVEMENT", "This achievement unlocks automatically when its condition is met.");
    const existing = ctx.store.db.select().from(achievementUnlocks).where(eq(achievementUnlocks.achievementId, id)).get();
    if (existing) throw conflict("ALREADY_UNLOCKED", "This achievement is already unlocked.");
    ctx.store.db.insert(achievementUnlocks).values({ achievementId: id, evidence, unlockedAt: ctx.clock.now().toISOString() }).run();
    addTimelineEvent(ctx, { type: "achievement", title: `Achievement unlocked: ${a.name}`, detail: evidence || a.description, sourceType: "achievement", sourceId: a.id });
    return listAchievements(ctx).find((x) => x.id === id)!;
  });
}

export function deleteCustomAchievement(ctx: AppContext, id: number): void {
  const a = ctx.store.db.select().from(achievements).where(eq(achievements.id, id)).get();
  if (!a) throw notFound("Achievement");
  if (!a.isCustom) throw conflict("BUILT_IN", "Built-in achievements can't be deleted.");
  const unlocked = ctx.store.db.select().from(achievementUnlocks).where(eq(achievementUnlocks.achievementId, id)).get();
  if (unlocked) throw conflict("ALREADY_UNLOCKED", "Unlocked achievements are permanent.");
  ctx.store.db.delete(achievements).where(eq(achievements.id, id)).run();
}

export interface UnseenUnlock {
  kind: "achievement" | "skill";
  id: number;
  name: string;
  detail: string;
  tier?: string;
}

/** Unlocks the UI hasn't celebrated yet. */
export function unseenUnlocks(ctx: AppContext): UnseenUnlock[] {
  const ach = ctx.store.db
    .select({ id: achievementUnlocks.id, name: achievements.name, detail: achievements.description, tier: achievements.tier })
    .from(achievementUnlocks)
    .innerJoin(achievements, eq(achievementUnlocks.achievementId, achievements.id))
    .where(isNull(achievementUnlocks.seenAt))
    .all()
    .map((a) => ({ kind: "achievement" as const, ...a }));
  const skills = ctx.store.db
    .select({ id: skillProgress.id, name: skillNodes.name, detail: skillNodes.description })
    .from(skillProgress)
    .innerJoin(skillNodes, eq(skillProgress.nodeId, skillNodes.id))
    .where(isNull(skillProgress.seenAt))
    .all()
    .map((s) => ({ kind: "skill" as const, ...s }));
  return [...ach, ...skills];
}

export function markUnlocksSeen(ctx: AppContext): void {
  const at = ctx.clock.now().toISOString();
  ctx.store.db.update(achievementUnlocks).set({ seenAt: at }).where(isNull(achievementUnlocks.seenAt)).run();
  ctx.store.db.update(skillProgress).set({ seenAt: at }).where(isNull(skillProgress.seenAt)).run();
}
