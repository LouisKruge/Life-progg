import { beforeEach, describe, expect, it } from "vitest";
import { makeCtx } from "../helpers.js";
import { AppError } from "../../src/server/errors.js";
import { updateSettings } from "../../src/server/services/settings.js";
import {
  confirmTransaction,
  correctTransaction,
  createAccountWithBalance,
  createDebt,
  createRecurring,
  createTransaction,
  deleteTransaction,
  generateRecurringForMonth,
  getWealthOverview,
  listAccounts,
  listTransactions,
  monthSummary,
  recordDebtPayment,
  runScenario,
  setBudget,
} from "../../src/server/services/wealth.js";
import { setupSavingsGoal } from "../../src/server/services/savings.js";
import { debtPayoff, monthBounds, savingsSeries, shiftMonth } from "../../src/server/domain/finance.js";
import { recentEvents } from "../../src/server/services/timeline.js";

let ctx: ReturnType<typeof makeCtx>;
beforeEach(() => {
  ctx = makeCtx();
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppError).code;
  }
  throw new Error("expected error");
};

describe("finance maths", () => {
  it("forecasts debt payoff with monthly compounding", () => {
    expect(debtPayoff(120_000, 0, 10_000)).toEqual({ months: 12, totalInterestCents: 0 });
    const f = debtPayoff(1_000_000, 1200, 100_000)!; // R10,000 at 12% APR, R1,000/month
    expect(f.months).toBe(11);
    expect(f.totalInterestCents).toBeGreaterThan(50_000);
    expect(debtPayoff(1_000_000, 2400, 20_000)).toBeNull(); // payment equals interest: never paid off
    expect(debtPayoff(0, 1000, 0)).toEqual({ months: 0, totalInterestCents: 0 });
  });

  it("projects savings and handles month arithmetic", () => {
    expect(savingsSeries(600_000, 500_000, 3)).toEqual([1_100_000, 1_600_000, 2_100_000]);
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("accounts and transactions", () => {
  it("normalises signs and keeps confirmed and pending money separate", () => {
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque", openingBalanceCents: 100_000 });
    createTransaction(ctx, { accountId: acc.id, amountCents: 2_500_000, kind: "income", category: "Salary" });
    createTransaction(ctx, { accountId: acc.id, amountCents: 40_000, kind: "expense", category: "Groceries" });
    const pending = createTransaction(ctx, { accountId: acc.id, amountCents: 900_000, kind: "expense", category: "Rent", status: "pending" });
    const a = listAccounts(ctx)[0]!;
    expect(a.balanceCents).toBe(100_000 + 2_500_000 - 40_000);
    expect(a.pendingCents).toBe(-900_000);

    confirmTransaction(ctx, pending.id);
    expect(listAccounts(ctx)[0]!.balanceCents).toBe(1_660_000);
  });

  it("refuses to delete confirmed history but allows reversing corrections", () => {
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque" });
    const t = createTransaction(ctx, { accountId: acc.id, amountCents: 10_000, kind: "income" });
    expect(code(() => deleteTransaction(ctx, t.id))).toBe("CONFIRMED_IMMUTABLE");
    correctTransaction(ctx, t.id);
    expect(listAccounts(ctx)[0]!.balanceCents).toBe(0);
    expect(listTransactions(ctx)).toHaveLength(2);
  });

  it("never lets a protected savings account go negative (and rolls back)", () => {
    const s = createAccountWithBalance(ctx, { name: "Savings", type: "savings", openingBalanceCents: 50_000 });
    expect(s.isProtected).toBe(true);
    expect(code(() => createTransaction(ctx, { accountId: s.id, amountCents: 60_000, kind: "withdrawal" }))).toBe("NEGATIVE_BALANCE");
    expect(listTransactions(ctx, { accountId: s.id })).toHaveLength(1);
  });
});

describe("recurring transactions", () => {
  it("generates pending entries once per month and never assumes they cleared", () => {
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque" });
    createRecurring(ctx, { accountId: acc.id, name: "Salary", amountCents: 2_500_000, kind: "income", dayOfMonth: 25 });
    createRecurring(ctx, { accountId: acc.id, name: "Rent", amountCents: 900_000, kind: "expense", category: "Housing", dayOfMonth: 1 });
    expect(generateRecurringForMonth(ctx, "2026-10")).toBe(0); // already generated on creation
    expect(generateRecurringForMonth(ctx, "2026-11")).toBe(2);
    expect(generateRecurringForMonth(ctx, "2026-11")).toBe(0);
    const oct = listTransactions(ctx, { month: "2026-10" });
    expect(oct.every((t) => t.status === "pending")).toBe(true);
    expect(oct.find((t) => t.description === "Rent")?.amountCents).toBe(-900_000);
    expect(listAccounts(ctx)[0]!.balanceCents).toBe(0);
    expect(monthSummary(ctx, "2026-10")).toMatchObject({ incomeCents: 0, pendingIncomeCents: 2_500_000, pendingExpensesCents: 900_000 });
  });
});

describe("budgets", () => {
  it("compares spending to category limits and carries budgets forward", () => {
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque" });
    setBudget(ctx, { month: "2026-09", category: "Groceries", limitCents: 400_000 });
    const overview = getWealthOverview(ctx); // October: carried forward from September
    expect(overview.summary.budget.find((b) => b.category === "Groceries")?.limitCents).toBe(400_000);
    createTransaction(ctx, { accountId: acc.id, amountCents: 150_000, kind: "expense", category: "Groceries" });
    expect(monthSummary(ctx, "2026-10").budget.find((b) => b.category === "Groceries")).toMatchObject({ spentCents: 150_000, limitCents: 400_000 });
  });
});

describe("debts", () => {
  it("tracks repayments, refuses overpayment and marks payoff", () => {
    const d = createDebt(ctx, { name: "Credit card", startingBalanceCents: 300_000, interestRateBps: 2000, minimumPaymentCents: 50_000 });
    expect(d.payoff?.months).toBeGreaterThan(6);
    recordDebtPayment(ctx, d.id, { amountCents: 200_000 });
    expect(code(() => recordDebtPayment(ctx, d.id, { amountCents: 200_000 }))).toBe("OVERPAYMENT");
    const done = recordDebtPayment(ctx, d.id, { amountCents: 100_000 });
    expect(done).toMatchObject({ balanceCents: 0, status: "paid_off" });
    expect(recentEvents(ctx).some((e) => e.type === "debt_paid_off")).toBe(true);
    expect(code(() => recordDebtPayment(ctx, d.id, { amountCents: 1 }))).toBe("DEBT_NOT_ACTIVE");
  });

  it("can record a repayment from an everyday account", () => {
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque", openingBalanceCents: 500_000 });
    const d = createDebt(ctx, { name: "Loan", startingBalanceCents: 100_000 });
    recordDebtPayment(ctx, d.id, { amountCents: 40_000, fromAccountId: acc.id });
    expect(listAccounts(ctx)[0]!.balanceCents).toBe(460_000);
  });
});

describe("overview and scenarios", () => {
  it("separates actual balances from labelled projections", () => {
    updateSettings(ctx, { monthlyIncomeCents: 2_500_000, monthlySavingsTargetCents: 500_000 });
    setupSavingsGoal(ctx, { name: "First milestone", targetCents: 2_000_000, monthlyContributionCents: 500_000, startingBalanceCents: 600_000 });
    createDebt(ctx, { name: "Car", startingBalanceCents: 1_000_000 });
    const o = getWealthOverview(ctx);
    expect(o.netWorthCents).toBe(600_000 - 1_000_000);
    expect(o.projection[0]).toEqual({ month: "2026-11", savingsCents: 1_100_000, netCents: 2_500_000 });
    expect(o.savingsGoals[0]?.savedCents).toBe(600_000);
  });

  it("runs what-if scenarios without changing data", () => {
    setupSavingsGoal(ctx, { name: "Goal", targetCents: 2_000_000, startingBalanceCents: 600_000 });
    const d = createDebt(ctx, { name: "Card", startingBalanceCents: 300_000, interestRateBps: 1800, minimumPaymentCents: 30_000 });
    const slow = runScenario(ctx, { monthlySavingsCents: 200_000 });
    const fast = runScenario(ctx, { monthlySavingsCents: 700_000, extraDebtPaymentCents: 50_000 });
    expect(slow.goals[0]).toMatchObject({ months: 7, month: "2027-05" });
    expect(fast.goals[0]).toMatchObject({ months: 2 });
    expect(fast.debts[0]!.months!).toBeLessThan(slow.debts[0]!.months!);
    expect(getWealthOverview(ctx).debts.find((x) => x.id === d.id)?.balanceCents).toBe(300_000);
  });

  it("computes the emergency fund target from expenses", () => {
    updateSettings(ctx, { emergencyFundMonths: 3 });
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque" });
    createRecurring(ctx, { accountId: acc.id, name: "Rent", amountCents: 900_000, kind: "expense", dayOfMonth: 1 });
    createAccountWithBalance(ctx, { name: "Emergency", type: "emergency", openingBalanceCents: 1_000_000 });
    const o = getWealthOverview(ctx);
    expect(o.emergencyFund).toMatchObject({ balanceCents: 1_000_000, targetCents: 2_700_000, monthlyExpensesCents: 900_000 });
  });
});
