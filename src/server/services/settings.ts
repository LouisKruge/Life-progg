import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { lifeCategories, userSettings, users } from "../db/schema.js";
import type { AiDataScope, DifficultyRewards, LifeCategory, RankThreshold, ReducedMotionPreference, Settings } from "../../shared/types.js";
import { dateInTimezone, isValidTimezone } from "../domain/dates.js";
import { badRequest } from "../errors.js";

export const USER_ID = 1;

export function getSettings({ store }: AppContext): Settings {
  const user = store.db.select().from(users).where(eq(users.id, USER_ID)).get();
  const s = store.db.select().from(userSettings).where(eq(userSettings.userId, USER_ID)).get();
  if (!user || !s) throw new Error("Default user is missing; database initialisation failed.");
  return {
    displayName: user.displayName,
    onboarded: user.onboardedAt !== null,
    timezone: s.timezone,
    locale: s.locale,
    currency: s.currency,
    restDays: s.restDays,
    dailyQuestLimit: s.dailyQuestLimit,
    undoWindowHours: s.undoWindowHours,
    rankThresholds: s.rankThresholds,
    difficultyRewards: s.difficultyRewards,
    reducedMotion: s.reducedMotion,
    mainGoals: s.mainGoals,
    rewardCategories: s.rewardCategories,
    monthlyIncomeCents: s.monthlyIncomeCents,
    monthlySavingsTargetCents: s.monthlySavingsTargetCents,
    monthlyRewardAllowanceCents: s.monthlyRewardAllowanceCents,
    aiEnabled: s.aiEnabled,
    hasApiKey: Boolean(s.anthropicApiKey),
    aiModel: s.aiModel,
    emergencyFundMonths: s.emergencyFundMonths,
    aiDataScopes: s.aiDataScopes,
  };
}

export interface SettingsPatch {
  displayName?: string;
  timezone?: string;
  locale?: string;
  currency?: string;
  restDays?: number[];
  dailyQuestLimit?: number | null;
  undoWindowHours?: number;
  rankThresholds?: RankThreshold[];
  difficultyRewards?: DifficultyRewards;
  reducedMotion?: ReducedMotionPreference;
  mainGoals?: string[];
  rewardCategories?: string[];
  monthlyIncomeCents?: number | null;
  monthlySavingsTargetCents?: number | null;
  monthlyRewardAllowanceCents?: number | null;
  aiEnabled?: boolean;
  aiModel?: string;
  emergencyFundMonths?: number;
  aiDataScopes?: AiDataScope[];
  /** A new key replaces the stored one; null removes it. Undefined leaves it untouched. */
  anthropicApiKey?: string | null;
}

export function updateSettings(ctx: AppContext, patch: SettingsPatch): Settings {
  if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) {
    throw badRequest("INVALID_TIMEZONE", `Unknown timezone "${patch.timezone}".`);
  }
  if (patch.rankThresholds !== undefined && !patch.rankThresholds.some((r) => r.minLevel === 1)) {
    throw badRequest("INVALID_RANKS", "One rank must start at level 1.");
  }
  const { displayName, ...rest } = patch;
  ctx.store.tx(() => {
    if (displayName !== undefined) {
      ctx.store.db.update(users).set({ displayName }).where(eq(users.id, USER_ID)).run();
    }
    const values = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (Object.keys(values).length > 0) {
      ctx.store.db
        .update(userSettings)
        .set({ ...values, updatedAt: ctx.clock.now().toISOString() })
        .where(eq(userSettings.userId, USER_ID))
        .run();
    }
  });
  return getSettings(ctx);
}

/** Returns the stored Claude API key for server-side use only. */
export function getApiKey({ store }: AppContext): string | null {
  return store.db.select().from(userSettings).where(eq(userSettings.userId, USER_ID)).get()?.anthropicApiKey ?? null;
}

export function listCategories({ store }: AppContext): LifeCategory[] {
  return store.db
    .select()
    .from(lifeCategories)
    .orderBy(lifeCategories.sortOrder)
    .all()
    .map((c) => ({ id: c.id, key: c.key, name: c.name, description: c.description, isFocus: c.isFocus }));
}

export function today(ctx: AppContext): string {
  return dateInTimezone(ctx.clock.now(), getSettings(ctx).timezone);
}
