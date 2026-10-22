import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { financialAccounts, financialTransactions, rewardBudgetPeriods, rewardRedemptions, rewards } from "../db/schema.js";
import type { RedemptionView, RewardBudget, RewardView, VaultData } from "../../shared/types.js";
import { monthOf } from "../domain/finance.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { creditBalance, recordCredits } from "./progression.js";
import { getSettings, today } from "./settings.js";
import { addTimelineEvent, removeEventsForSource } from "./timeline.js";
import { runProgressHooks } from "./hooks.js";

// Safeguards implemented here (see README "Rewards economy"):
// - Credits have no cash value and can't be bought; they're only earned from quests.
// - A paid reward needs enough credits AND enough of this month's discretionary allowance.
// - Redeeming reserves allowance; it does not claim money was spent. Spending is confirmed separately.
// - Spending can never be recorded against a protected (savings / emergency) account.
// - Free rewards need no allowance at all.

type RewardRow = typeof rewards.$inferSelect;
type RedemptionRow = typeof rewardRedemptions.$inferSelect;

const toRedemption = (r: RedemptionRow): RedemptionView => ({
  id: r.id,
  rewardId: r.rewardId,
  rewardName: r.rewardName,
  creditCost: r.creditCost,
  reservedCents: r.reservedCents,
  actualCostCents: r.actualCostCents,
  status: r.status,
  note: r.note,
  redeemedAt: r.redeemedAt,
  fulfilledAt: r.fulfilledAt,
  cancelledAt: r.cancelledAt,
});

// ---------- Allowance ----------

function ensurePeriod(ctx: AppContext, month: string) {
  const existing = ctx.store.db.select().from(rewardBudgetPeriods).where(eq(rewardBudgetPeriods.month, month)).get();
  if (existing) return existing;
  const allowance = getSettings(ctx).monthlyRewardAllowanceCents ?? 0;
  return ctx.store.db.insert(rewardBudgetPeriods).values({ month, allowanceCents: allowance }).returning().get();
}

/** Allowance for `month` (default: the current month) with what's reserved and confirmed as spent. */
export function getRewardBudget(ctx: AppContext, month = monthOf(today(ctx))): RewardBudget {
  const period = ensurePeriod(ctx, month);
  const rows = ctx.store.db
    .select({ status: rewardRedemptions.status, reserved: rewardRedemptions.reservedCents, actual: rewardRedemptions.actualCostCents })
    .from(rewardRedemptions)
    .where(and(eq(rewardRedemptions.budgetPeriodId, period.id), ne(rewardRedemptions.status, "cancelled")))
    .all();
  const reservedCents = rows.filter((r) => r.status === "reserved").reduce((s, r) => s + r.reserved, 0);
  const spentCents = rows.filter((r) => r.status === "fulfilled").reduce((s, r) => s + (r.actual ?? r.reserved), 0);
  return { month, allowanceCents: period.allowanceCents, reservedCents, spentCents, availableCents: period.allowanceCents - reservedCents - spentCents };
}

/** Applies the allowance from settings to the current month (past months keep their historical allowance). */
export function syncCurrentAllowance(ctx: AppContext): void {
  const month = monthOf(today(ctx));
  ensurePeriod(ctx, month);
  ctx.store.db
    .update(rewardBudgetPeriods)
    .set({ allowanceCents: getSettings(ctx).monthlyRewardAllowanceCents ?? 0 })
    .where(eq(rewardBudgetPeriods.month, month))
    .run();
}

// ---------- Rewards CRUD ----------

function timesRedeemed(ctx: AppContext): Map<number, number> {
  return new Map(
    ctx.store.db
      .select({ id: rewardRedemptions.rewardId, n: sql<number>`COUNT(*)` })
      .from(rewardRedemptions)
      .where(ne(rewardRedemptions.status, "cancelled"))
      .groupBy(rewardRedemptions.rewardId)
      .all()
      .map((r) => [r.id, Number(r.n)]),
  );
}

function blockedReason(r: RewardRow, redeemed: number, credits: number, budget: RewardBudget, allowanceConfigured: boolean): string | null {
  if (r.status !== "active") return "Archived";
  if (r.quantityAvailable !== null && r.quantityAvailable <= 0) return "None left";
  if (!r.repeatable && redeemed > 0) return "Already redeemed";
  if (credits < r.creditPrice) return `${r.creditPrice - credits} more credits needed`;
  if (r.estimatedCostCents > 0) {
    if (!allowanceConfigured) return "Set a monthly reward allowance first";
    if (budget.availableCents < r.estimatedCostCents) return "Not enough allowance left this month";
  }
  return null;
}

export function listRewardViews(ctx: AppContext, opts: { includeArchived?: boolean } = {}): RewardView[] {
  const counts = timesRedeemed(ctx);
  const credits = creditBalance(ctx);
  const budget = getRewardBudget(ctx);
  const allowanceConfigured = getSettings(ctx).monthlyRewardAllowanceCents !== null || budget.allowanceCents > 0;
  const q = ctx.store.db.select().from(rewards);
  const rows = (opts.includeArchived ? q : q.where(eq(rewards.status, "active"))).orderBy(asc(rewards.sortOrder), asc(rewards.id)).all();
  return rows.map((r) => {
    const n = counts.get(r.id) ?? 0;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      imageUrl: r.imageUrl,
      category: r.category,
      creditPrice: r.creditPrice,
      estimatedCostCents: r.estimatedCostCents,
      quantityAvailable: r.quantityAvailable,
      repeatable: r.repeatable,
      status: r.status,
      isWishlisted: r.isWishlisted,
      isDemo: r.isDemo,
      sortOrder: r.sortOrder,
      timesRedeemed: n,
      blockedReason: blockedReason(r, n, credits, budget, allowanceConfigured),
    };
  });
}

/** Backwards-compatible light listing used by the dashboard preview. */
export function listRewards(ctx: AppContext) {
  return listRewardViews(ctx);
}

export function getVault(ctx: AppContext, opts: { includeArchived?: boolean } = {}): VaultData {
  return {
    credits: creditBalance(ctx),
    budget: getRewardBudget(ctx),
    rewards: listRewardViews(ctx, opts),
    redemptions: ctx.store.db.select().from(rewardRedemptions).orderBy(desc(rewardRedemptions.id)).limit(100).all().map(toRedemption),
  };
}

export interface RewardInput {
  name: string;
  description?: string;
  imageUrl?: string | null;
  category?: string;
  creditPrice: number;
  estimatedCostCents?: number;
  quantityAvailable?: number | null;
  repeatable?: boolean;
  isWishlisted?: boolean;
}

function getRewardRow(ctx: AppContext, id: number): RewardRow {
  const r = ctx.store.db.select().from(rewards).where(eq(rewards.id, id)).get();
  if (!r) throw notFound("Reward");
  return r;
}

function view(ctx: AppContext, id: number): RewardView {
  const v = listRewardViews(ctx, { includeArchived: true }).find((r) => r.id === id);
  if (!v) throw notFound("Reward");
  return v;
}

export function createReward(ctx: AppContext, input: RewardInput): RewardView {
  const maxOrder = ctx.store.db.select({ m: sql<number>`COALESCE(MAX(${rewards.sortOrder}), -1)` }).from(rewards).get();
  const row = ctx.store.db
    .insert(rewards)
    .values({
      name: input.name,
      description: input.description ?? "",
      imageUrl: input.imageUrl ?? null,
      category: input.category ?? "experience",
      creditPrice: input.creditPrice,
      estimatedCostCents: input.estimatedCostCents ?? 0,
      quantityAvailable: input.quantityAvailable ?? null,
      repeatable: input.repeatable ?? true,
      isWishlisted: input.isWishlisted ?? false,
      sortOrder: Number(maxOrder?.m ?? -1) + 1,
    })
    .returning()
    .get();
  return view(ctx, row.id);
}

export function updateReward(ctx: AppContext, id: number, patch: Partial<RewardInput> & { status?: "active" | "archived" }): RewardView {
  getRewardRow(ctx, id);
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  ctx.store.db.update(rewards).set({ ...values, updatedAt: ctx.clock.now().toISOString() }).where(eq(rewards.id, id)).run();
  return view(ctx, id);
}

/** Deletes a reward, or archives it if it has redemption history (history is never destroyed). */
export function deleteReward(ctx: AppContext, id: number): { deleted: boolean; archived: boolean } {
  return ctx.store.tx(() => {
    getRewardRow(ctx, id);
    const used = ctx.store.db.select({ id: rewardRedemptions.id }).from(rewardRedemptions).where(eq(rewardRedemptions.rewardId, id)).get();
    if (used) {
      ctx.store.db.update(rewards).set({ status: "archived", updatedAt: ctx.clock.now().toISOString() }).where(eq(rewards.id, id)).run();
      return { deleted: false, archived: true };
    }
    ctx.store.db.delete(rewards).where(eq(rewards.id, id)).run();
    return { deleted: true, archived: false };
  });
}

export function reorderRewards(ctx: AppContext, ids: number[]): RewardView[] {
  ctx.store.tx(() => {
    const existing = new Set(ctx.store.db.select({ id: rewards.id }).from(rewards).where(inArray(rewards.id, ids)).all().map((r) => r.id));
    if (existing.size !== new Set(ids).size) throw badRequest("UNKNOWN_REWARD", "One or more rewards no longer exist.");
    ids.forEach((id, i) => ctx.store.db.update(rewards).set({ sortOrder: i }).where(eq(rewards.id, id)).run());
  });
  return listRewardViews(ctx, { includeArchived: true });
}

// ---------- Redemption lifecycle ----------

export interface RedeemResult {
  redemption: RedemptionView;
  credits: number;
  budget: RewardBudget;
  /** True when this request had already been processed (no second charge). */
  duplicate: boolean;
}

/**
 * Redeems a reward: spends credits and, for paid rewards, reserves part of this month's
 * allowance. `requestId` makes retries and double clicks safe.
 */
export function redeemReward(ctx: AppContext, rewardId: number, input: { requestId: string; note?: string }): RedeemResult {
  const key = `redeem:${input.requestId}`;
  return ctx.store.tx(() => {
    const prior = ctx.store.db.select().from(rewardRedemptions).where(eq(rewardRedemptions.idempotencyKey, key)).get();
    if (prior) {
      if (prior.rewardId !== rewardId) throw conflict("REQUEST_ID_REUSED", "That request id was already used for another reward.");
      return { redemption: toRedemption(prior), credits: creditBalance(ctx), budget: getRewardBudget(ctx), duplicate: true };
    }

    const reward = getRewardRow(ctx, rewardId);
    if (reward.status !== "active") throw conflict("REWARD_ARCHIVED", "This reward is archived.");
    if (reward.quantityAvailable !== null && reward.quantityAvailable <= 0) throw conflict("OUT_OF_STOCK", "There are none of this reward left.");
    if (!reward.repeatable) {
      const used = ctx.store.db
        .select({ id: rewardRedemptions.id })
        .from(rewardRedemptions)
        .where(and(eq(rewardRedemptions.rewardId, rewardId), ne(rewardRedemptions.status, "cancelled")))
        .get();
      if (used) throw conflict("ALREADY_REDEEMED", "This is a one-time reward and has already been redeemed.");
    }
    const credits = creditBalance(ctx);
    if (credits < reward.creditPrice) {
      throw conflict("INSUFFICIENT_CREDITS", `You need ${reward.creditPrice - credits} more credits for this reward.`);
    }

    const month = monthOf(today(ctx));
    const period = ensurePeriod(ctx, month);
    if (reward.estimatedCostCents > 0) {
      const configured = getSettings(ctx).monthlyRewardAllowanceCents !== null || period.allowanceCents > 0;
      if (!configured) {
        throw conflict("NO_ALLOWANCE", "This reward costs real money. Set a monthly reward allowance in Settings first.");
      }
      const budget = getRewardBudget(ctx, month);
      if (budget.availableCents < reward.estimatedCostCents) {
        throw conflict(
          "INSUFFICIENT_ALLOWANCE",
          "Not enough reward allowance left this month. It resets next month; savings are never used for rewards.",
          { availableCents: budget.availableCents, neededCents: reward.estimatedCostCents },
        );
      }
    }

    const row = ctx.store.db
      .insert(rewardRedemptions)
      .values({
        rewardId,
        rewardName: reward.name,
        creditCost: reward.creditPrice,
        reservedCents: reward.estimatedCostCents,
        budgetPeriodId: period.id,
        note: input.note ?? "",
        idempotencyKey: key,
        redeemedAt: ctx.clock.now().toISOString(),
      })
      .returning()
      .get();
    recordCredits(ctx, { amount: -reward.creditPrice, sourceType: "redemption", sourceId: row.id, idempotencyKey: `redemption:${row.id}`, note: reward.name });
    if (reward.quantityAvailable !== null) {
      ctx.store.db.update(rewards).set({ quantityAvailable: reward.quantityAvailable - 1 }).where(eq(rewards.id, rewardId)).run();
    }
    addTimelineEvent(ctx, { type: "reward_redeemed", title: `Redeemed: ${reward.name}`, detail: `${reward.creditPrice} credits`, sourceType: "redemption", sourceId: row.id });
    runProgressHooks(ctx);
    return { redemption: toRedemption(row), credits: creditBalance(ctx), budget: getRewardBudget(ctx, month), duplicate: false };
  });
}

function getRedemptionRow(ctx: AppContext, id: number): RedemptionRow {
  const r = ctx.store.db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, id)).get();
  if (!r) throw notFound("Redemption");
  return r;
}

/** Cancels a redemption that hasn't been used yet: refunds credits and releases the reserved allowance. */
export function cancelRedemption(ctx: AppContext, id: number): RedeemResult {
  return ctx.store.tx(() => {
    const r = getRedemptionRow(ctx, id);
    if (r.status === "cancelled") throw conflict("ALREADY_CANCELLED", "This redemption was already cancelled.");
    if (r.status === "fulfilled") {
      throw conflict("ALREADY_FULFILLED", "Spending for this reward was already confirmed, so it can't be refunded.");
    }
    ctx.store.db.update(rewardRedemptions).set({ status: "cancelled", cancelledAt: ctx.clock.now().toISOString() }).where(eq(rewardRedemptions.id, id)).run();
    recordCredits(ctx, { amount: r.creditCost, sourceType: "refund", sourceId: r.id, idempotencyKey: `refund:${r.id}`, note: `Refund: ${r.rewardName}` });
    const reward = getRewardRow(ctx, r.rewardId);
    if (reward.quantityAvailable !== null) {
      ctx.store.db.update(rewards).set({ quantityAvailable: reward.quantityAvailable + 1 }).where(eq(rewards.id, reward.id)).run();
    }
    removeEventsForSource(ctx, "redemption", r.id);
    return { redemption: toRedemption(getRedemptionRow(ctx, id)), credits: creditBalance(ctx), budget: getRewardBudget(ctx), duplicate: false };
  });
}

/**
 * Records that the reward actually happened and what it really cost. Optionally logs the
 * expense against a non-protected account; savings and emergency accounts are refused.
 */
export function confirmRedemptionSpending(
  ctx: AppContext,
  id: number,
  input: { actualCostCents?: number; accountId?: number | null },
): RedeemResult & { overBudget: boolean } {
  return ctx.store.tx(() => {
    const r = getRedemptionRow(ctx, id);
    if (r.status !== "reserved") throw conflict("NOT_RESERVED", "Only open redemptions can be confirmed.");
    const actual = input.actualCostCents ?? r.reservedCents;
    if (input.accountId) {
      const acc = ctx.store.db.select().from(financialAccounts).where(eq(financialAccounts.id, input.accountId)).get();
      if (!acc) throw notFound("Account");
      if (acc.isProtected) {
        throw conflict("PROTECTED_ACCOUNT", "Savings and emergency accounts can't be used for rewards. Choose an everyday account.");
      }
      if (actual > 0) {
        ctx.store.db
          .insert(financialTransactions)
          .values({ accountId: acc.id, amountCents: -actual, kind: "expense", category: "rewards", description: r.rewardName, occurredOn: today(ctx), status: "confirmed" })
          .run();
      }
    }
    ctx.store.db
      .update(rewardRedemptions)
      .set({ status: "fulfilled", actualCostCents: actual, fulfilledAt: ctx.clock.now().toISOString() })
      .where(eq(rewardRedemptions.id, id))
      .run();
    const budget = getRewardBudget(ctx);
    return { redemption: toRedemption(getRedemptionRow(ctx, id)), credits: creditBalance(ctx), budget, duplicate: false, overBudget: budget.availableCents < 0 };
  });
}
