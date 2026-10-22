import { and, eq, inArray, notExists } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { financialTransactions, lifeCategories, questInstances, quests, rewardRedemptions, rewards, users } from "../db/schema.js";
import type { QuestDifficulty, QuestFrequency, Settings } from "../../shared/types.js";
import { conflict } from "../errors.js";
import { createQuest } from "./quests.js";
import { createAccount, createSavingsGoal } from "./savings.js";
import { getSettings, today, updateSettings, USER_ID } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";

export interface OnboardingInput {
  displayName?: string;
  mainGoals?: string[];
  focusCategories?: string[];
  dailyQuestLimit?: number | null;
  rewardCategories?: string[];
  monthlyRewardAllowanceCents?: number | null;
  finances?: {
    monthlyIncomeCents?: number | null;
    startingSavingsCents?: number | null;
    monthlySavingsTargetCents?: number | null;
    firstMilestoneCents?: number | null;
    longTermMilestoneCents?: number | null;
  };
  anthropicApiKey?: string | null;
  loadDemoData?: boolean;
}

/** Completes first-run setup in one transaction. Every field is optional so each step can be skipped. */
export function completeOnboarding(ctx: AppContext, input: OnboardingInput): Settings {
  if (getSettings(ctx).onboarded) throw conflict("ALREADY_ONBOARDED", "Onboarding has already been completed.");
  ctx.store.tx(() => {
    const f = input.finances ?? {};
    updateSettings(ctx, {
      displayName: input.displayName?.trim() || undefined,
      mainGoals: input.mainGoals,
      dailyQuestLimit: input.dailyQuestLimit,
      rewardCategories: input.rewardCategories,
      monthlyRewardAllowanceCents: input.monthlyRewardAllowanceCents,
      monthlyIncomeCents: f.monthlyIncomeCents,
      monthlySavingsTargetCents: f.monthlySavingsTargetCents,
      anthropicApiKey: input.anthropicApiKey?.trim() || undefined,
      aiEnabled: input.anthropicApiKey?.trim() ? true : undefined,
    });

    if (input.focusCategories?.length) {
      ctx.store.db.update(lifeCategories).set({ isFocus: false }).run();
      ctx.store.db.update(lifeCategories).set({ isFocus: true }).where(inArray(lifeCategories.key, input.focusCategories)).run();
    }

    const wantsSavings = f.startingSavingsCents != null || f.firstMilestoneCents != null;
    if (wantsSavings) {
      const accountId = createAccount(ctx, "Savings", "savings");
      if (f.startingSavingsCents && f.startingSavingsCents > 0) {
        ctx.store.db
          .insert(financialTransactions)
          .values({ accountId, amountCents: f.startingSavingsCents, kind: "opening_balance", description: "Starting savings", occurredOn: today(ctx), status: "confirmed" })
          .run();
      }
      const monthly = f.monthlySavingsTargetCents ?? null;
      if (f.firstMilestoneCents) createSavingsGoal(ctx, { name: "First milestone", targetCents: f.firstMilestoneCents, monthlyContributionCents: monthly, accountId });
      if (f.longTermMilestoneCents) createSavingsGoal(ctx, { name: "Long-term milestone", targetCents: f.longTermMilestoneCents, monthlyContributionCents: monthly, accountId });
    }

    if (input.loadDemoData) loadDemoData(ctx);

    ctx.store.db.update(users).set({ onboardedAt: ctx.clock.now().toISOString() }).where(eq(users.id, USER_ID)).run();
    addTimelineEvent(ctx, { type: "journey_started", title: "Journey started", detail: "LEVEL ONE was set up." });
  });
  return getSettings(ctx);
}

const DEMO_QUESTS: Array<{ title: string; description: string; category: string; difficulty: QuestDifficulty; frequency: QuestFrequency }> = [
  { title: "Plan tomorrow", description: "Write down the three things that matter most tomorrow.", category: "discipline", difficulty: "easy", frequency: "daily" },
  { title: "Move for 30 minutes", description: "Walk, train, cycle or stretch.", category: "physique", difficulty: "medium", frequency: "daily" },
  { title: "Read 15 pages", description: "Any book that teaches or inspires.", category: "mind", difficulty: "easy", frequency: "daily" },
  { title: "Log today's spending", description: "Record what went out today.", category: "wealth", difficulty: "trivial", frequency: "daily" },
  { title: "Weekly money review", description: "Check balances and adjust the budget.", category: "wealth", difficulty: "medium", frequency: "weekly" },
  { title: "Call someone you care about", description: "A real conversation, not a text.", category: "life", difficulty: "easy", frequency: "weekly" },
];

const DEMO_REWARDS = [
  { name: "Gaming evening", category: "leisure", creditPrice: 40, estimatedCostCents: 0 },
  { name: "Favourite takeaway", category: "food", creditPrice: 60, estimatedCostCents: 25_000 },
  { name: "Cinema experience", category: "experience", creditPrice: 80, estimatedCostCents: 30_000 },
  { name: "Golf outing", category: "experience", creditPrice: 150, estimatedCostCents: 80_000 },
  { name: "Car detailing", category: "purchase", creditPrice: 180, estimatedCostCents: 60_000 },
  { name: "Restaurant date", category: "experience", creditPrice: 200, estimatedCostCents: 90_000 },
  { name: "Weekend adventure", category: "experience", creditPrice: 600, estimatedCostCents: 350_000 },
  { name: "Gaming equipment fund", category: "purchase", creditPrice: 1000, estimatedCostCents: 500_000 },
];

/** Adds clearly flagged example quests and rewards. Safe to remove later with `removeDemoData`. */
export function loadDemoData(ctx: AppContext): void {
  ctx.store.tx(() => {
    const cats = new Map(ctx.store.db.select().from(lifeCategories).all().map((c) => [c.key, c.id]));
    for (const q of DEMO_QUESTS) {
      createQuest(ctx, { ...q, categoryId: cats.get(q.category) ?? null, isDemo: true });
    }
    for (const [i, r] of DEMO_REWARDS.entries()) {
      ctx.store.db.insert(rewards).values({ ...r, description: "Example reward - edit or remove it.", isDemo: true, sortOrder: i }).run();
    }
  });
}

/**
 * Removes demo content. Demo quests with history are archived rather than deleted, so
 * XP and credits that were genuinely earned stay intact.
 */
export function removeDemoData(ctx: AppContext): { deletedQuests: number; archivedQuests: number; deletedRewards: number; archivedRewards: number } {
  return ctx.store.tx(() => {
    const unused = ctx.store.db
      .select({ id: quests.id })
      .from(quests)
      .where(and(eq(quests.isDemo, true), notExists(ctx.store.db.select().from(questInstances).where(eq(questInstances.questId, quests.id)))))
      .all()
      .map((r) => r.id);
    // Quests that already appeared on the board keep their instance history, so they are archived instead.
    const withHistory = ctx.store.db
      .select({ id: quests.id })
      .from(quests)
      .where(and(eq(quests.isDemo, true), eq(quests.status, "active")))
      .all()
      .map((r) => r.id)
      .filter((id) => !unused.includes(id));
    if (unused.length) ctx.store.db.delete(quests).where(inArray(quests.id, unused)).run();
    const nowIso = ctx.clock.now().toISOString();
    if (withHistory.length) {
      ctx.store.db.update(quests).set({ status: "archived", archivedAt: nowIso }).where(inArray(quests.id, withHistory)).run();
    }
    // Redeemed demo rewards are part of the user's real history, so they are archived instead.
    const redeemed = ctx.store.db.selectDistinct({ id: rewardRedemptions.rewardId }).from(rewardRedemptions).all().map((r) => r.id);
    const demoRewards = ctx.store.db.select({ id: rewards.id }).from(rewards).where(eq(rewards.isDemo, true)).all().map((r) => r.id);
    const toArchive = demoRewards.filter((id) => redeemed.includes(id));
    const toDelete = demoRewards.filter((id) => !redeemed.includes(id));
    if (toArchive.length) ctx.store.db.update(rewards).set({ status: "archived" }).where(inArray(rewards.id, toArchive)).run();
    if (toDelete.length) ctx.store.db.delete(rewards).where(inArray(rewards.id, toDelete)).run();
    return { deletedQuests: unused.length, archivedQuests: withHistory.length, deletedRewards: toDelete.length, archivedRewards: toArchive.length };
  });
}
