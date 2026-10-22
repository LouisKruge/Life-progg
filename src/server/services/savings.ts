import { and, asc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { financialAccounts, financialTransactions, savingsGoals } from "../db/schema.js";
import type { SavingsGoalView } from "../../shared/types.js";
import { addMonthsToMonth } from "../domain/dates.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { today } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";

/** Confirmed balance of an account. Pending (scheduled, uncleared) transactions are excluded on purpose. */
export function accountBalance(ctx: AppContext, accountId: number): number {
  const row = ctx.store.db
    .select({ total: sql<number>`COALESCE(SUM(${financialTransactions.amountCents}), 0)` })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.accountId, accountId), eq(financialTransactions.status, "confirmed")))
    .get();
  return Number(row?.total ?? 0);
}

/**
 * Months until `targetCents` is reached from `savedCents` at `monthlyCents` per month.
 * Returns 0 when already reached and null when there is no positive contribution.
 */
export function monthsToTarget(savedCents: number, targetCents: number, monthlyCents: number | null): number | null {
  if (savedCents >= targetCents) return 0;
  if (!monthlyCents || monthlyCents <= 0) return null;
  return Math.ceil((targetCents - savedCents) / monthlyCents);
}

function toView(ctx: AppContext, g: typeof savingsGoals.$inferSelect): SavingsGoalView {
  const saved = g.accountId ? accountBalance(ctx, g.accountId) : 0;
  const months = monthsToTarget(saved, g.targetCents, g.monthlyContributionCents);
  return {
    id: g.id,
    name: g.name,
    targetCents: g.targetCents,
    savedCents: saved,
    monthlyContributionCents: g.monthlyContributionCents,
    targetDate: g.targetDate,
    projectedCompletion: months === null ? null : addMonthsToMonth(today(ctx), months),
    accountId: g.accountId,
  };
}

export function listSavingsGoals(ctx: AppContext): SavingsGoalView[] {
  return ctx.store.db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.status, "active"))
    .orderBy(asc(savingsGoals.sortOrder), asc(savingsGoals.targetCents))
    .all()
    .map((g) => toView(ctx, g));
}

/** The first active goal that has not been reached yet, or the last reached one. */
export function activeSavingsGoal(ctx: AppContext): SavingsGoalView | null {
  const goals = listSavingsGoals(ctx);
  return goals.find((g) => g.savedCents < g.targetCents) ?? goals.at(-1) ?? null;
}

export interface SavingsGoalInput {
  name: string;
  targetCents: number;
  monthlyContributionCents?: number | null;
  targetDate?: string | null;
  accountId?: number | null;
}

export function createSavingsGoal(ctx: AppContext, input: SavingsGoalInput): SavingsGoalView {
  if (input.accountId) {
    const acc = ctx.store.db.select().from(financialAccounts).where(eq(financialAccounts.id, input.accountId)).get();
    if (!acc) throw notFound("Account");
  }
  const row = ctx.store.db
    .insert(savingsGoals)
    .values({
      name: input.name,
      targetCents: input.targetCents,
      monthlyContributionCents: input.monthlyContributionCents ?? null,
      targetDate: input.targetDate ?? null,
      accountId: input.accountId ?? null,
    })
    .returning()
    .get();
  return toView(ctx, row);
}

export function createAccount(ctx: AppContext, name: string, type: "savings" | "emergency" | "cheque" | "investment" | "cash"): number {
  return ctx.store.db
    .insert(financialAccounts)
    .values({ name, type, isProtected: type === "savings" || type === "emergency" })
    .returning({ id: financialAccounts.id })
    .get().id;
}

export interface SavingsEntryInput {
  amountCents: number;
  description?: string;
  occurredOn?: string;
}

/**
 * Records a confirmed deposit (positive) or withdrawal (negative) against the goal's account.
 * This logs money the user says has actually moved; LEVEL ONE never moves money itself.
 */
export function recordSavingsEntry(ctx: AppContext, goalId: number, input: SavingsEntryInput): SavingsGoalView {
  return ctx.store.tx(() => {
    const goal = ctx.store.db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).get();
    if (!goal) throw notFound("Savings goal");
    if (!goal.accountId) throw conflict("NO_ACCOUNT", "This goal is not linked to an account.");
    if (input.amountCents === 0) throw badRequest("ZERO_AMOUNT", "Enter an amount other than zero.");
    const before = accountBalance(ctx, goal.accountId);
    if (before + input.amountCents < 0) {
      throw conflict("NEGATIVE_BALANCE", "A withdrawal can't be larger than the recorded balance.");
    }
    ctx.store.db
      .insert(financialTransactions)
      .values({
        accountId: goal.accountId,
        amountCents: input.amountCents,
        kind: input.amountCents > 0 ? "deposit" : "withdrawal",
        description: input.description ?? "",
        occurredOn: input.occurredOn ?? today(ctx),
        status: "confirmed",
      })
      .run();
    const after = before + input.amountCents;
    if (before < goal.targetCents && after >= goal.targetCents) {
      addTimelineEvent(ctx, { type: "savings_milestone", title: `Savings goal reached: ${goal.name}`, sourceType: "savings_goal", sourceId: goal.id });
    }
    return toView(ctx, goal);
  });
}

/**
 * Creates a savings goal linked to the user's savings account, creating that account
 * (with an optional confirmed opening balance) if none exists yet.
 */
export function setupSavingsGoal(ctx: AppContext, input: Omit<SavingsGoalInput, "accountId"> & { startingBalanceCents?: number }): SavingsGoalView {
  return ctx.store.tx(() => {
    const existing = ctx.store.db
      .select()
      .from(financialAccounts)
      .where(and(eq(financialAccounts.type, "savings"), sql`${financialAccounts.archivedAt} IS NULL`))
      .orderBy(asc(financialAccounts.id))
      .get();
    let accountId = existing?.id;
    if (!accountId) {
      accountId = createAccount(ctx, "Savings", "savings");
      if (input.startingBalanceCents && input.startingBalanceCents > 0) {
        ctx.store.db
          .insert(financialTransactions)
          .values({ accountId, amountCents: input.startingBalanceCents, kind: "opening_balance", description: "Starting savings", occurredOn: today(ctx), status: "confirmed" })
          .run();
      }
    }
    return createSavingsGoal(ctx, { ...input, accountId });
  });
}
