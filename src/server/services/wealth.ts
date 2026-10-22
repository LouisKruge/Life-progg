import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { budgets, debtPayments, debts, financialAccounts, financialTransactions, recurringTransactions } from "../db/schema.js";
import type {
  AccountType,
  AccountView,
  BudgetLine,
  DebtView,
  MonthSummary,
  ProjectionPoint,
  RecurringView,
  ScenarioResult,
  TransactionKind,
  TransactionView,
  WealthOverview,
} from "../../shared/types.js";
import { debtPayoff, monthBounds, monthOf, monthsToTarget, shiftMonth } from "../domain/finance.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { accountBalance, listSavingsGoals } from "./savings.js";
import { getSettings, today } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";
import { runProgressHooks } from "./hooks.js";

// Actual balances only ever sum *confirmed* transactions. Pending rows are scheduled or planned
// money that hasn't been confirmed by the user, and are reported separately as projections.

// ---------- Accounts ----------

function pendingSum(ctx: AppContext, accountId: number): number {
  const row = ctx.store.db
    .select({ t: sql<number>`COALESCE(SUM(${financialTransactions.amountCents}), 0)` })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.accountId, accountId), eq(financialTransactions.status, "pending")))
    .get();
  return Number(row?.t ?? 0);
}

export function listAccounts(ctx: AppContext, opts: { includeArchived?: boolean } = {}): AccountView[] {
  const q = ctx.store.db.select().from(financialAccounts);
  return (opts.includeArchived ? q : q.where(isNull(financialAccounts.archivedAt)))
    .orderBy(asc(financialAccounts.id))
    .all()
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      isProtected: a.isProtected,
      balanceCents: accountBalance(ctx, a.id),
      pendingCents: pendingSum(ctx, a.id),
      archived: a.archivedAt !== null,
    }));
}

function getAccountRow(ctx: AppContext, id: number) {
  const a = ctx.store.db.select().from(financialAccounts).where(eq(financialAccounts.id, id)).get();
  if (!a) throw notFound("Account");
  return a;
}

export function createAccountWithBalance(ctx: AppContext, input: { name: string; type: AccountType; openingBalanceCents?: number }): AccountView {
  return ctx.store.tx(() => {
    const row = ctx.store.db
      .insert(financialAccounts)
      .values({ name: input.name, type: input.type, isProtected: input.type === "savings" || input.type === "emergency" })
      .returning()
      .get();
    if (input.openingBalanceCents) {
      ctx.store.db
        .insert(financialTransactions)
        .values({ accountId: row.id, amountCents: input.openingBalanceCents, kind: "opening_balance", description: "Opening balance", occurredOn: today(ctx), status: "confirmed" })
        .run();
    }
    return listAccounts(ctx, { includeArchived: true }).find((a) => a.id === row.id)!;
  });
}

export function updateAccount(ctx: AppContext, id: number, patch: { name?: string; archived?: boolean }): AccountView {
  getAccountRow(ctx, id);
  ctx.store.db
    .update(financialAccounts)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.archived !== undefined ? { archivedAt: patch.archived ? ctx.clock.now().toISOString() : null } : {}),
    })
    .where(eq(financialAccounts.id, id))
    .run();
  return listAccounts(ctx, { includeArchived: true }).find((a) => a.id === id)!;
}

// ---------- Transactions ----------

export interface TransactionInput {
  accountId: number;
  amountCents: number;
  kind: TransactionKind;
  category?: string;
  description?: string;
  occurredOn?: string;
  status?: "confirmed" | "pending";
}

const SIGN: Record<TransactionKind, 1 | -1 | 0> = { income: 1, deposit: 1, expense: -1, withdrawal: -1, opening_balance: 1, correction: 0 };

/** Normalises the sign from the kind: users enter positive amounts for income and expenses alike. */
export function signedAmount(kind: TransactionKind, amountCents: number): number {
  const sign = SIGN[kind];
  return sign === 0 ? amountCents : sign * Math.abs(amountCents);
}

function assertProtectedBalance(ctx: AppContext, accountId: number) {
  const acc = getAccountRow(ctx, accountId);
  if (acc.isProtected && accountBalance(ctx, accountId) < 0) {
    throw conflict("NEGATIVE_BALANCE", `${acc.name} can't go below zero.`);
  }
}

function toTx(r: typeof financialTransactions.$inferSelect & { accountName: string }): TransactionView {
  return {
    id: r.id,
    accountId: r.accountId,
    accountName: r.accountName,
    amountCents: r.amountCents,
    kind: r.kind,
    category: r.category,
    description: r.description,
    occurredOn: r.occurredOn,
    status: r.status,
    recurringId: r.recurringId,
  };
}

export function listTransactions(ctx: AppContext, opts: { month?: string; accountId?: number } = {}): TransactionView[] {
  const conds = [];
  if (opts.month) {
    const { start, end } = monthBounds(opts.month);
    conds.push(gte(financialTransactions.occurredOn, start), lte(financialTransactions.occurredOn, end));
  }
  if (opts.accountId) conds.push(eq(financialTransactions.accountId, opts.accountId));
  return ctx.store.db
    .select({ tx: financialTransactions, accountName: financialAccounts.name })
    .from(financialTransactions)
    .innerJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(financialTransactions.occurredOn), desc(financialTransactions.id))
    .limit(500)
    .all()
    .map(({ tx, accountName }) => toTx({ ...tx, accountName }));
}

function txView(ctx: AppContext, id: number): TransactionView {
  const row = ctx.store.db
    .select({ tx: financialTransactions, accountName: financialAccounts.name })
    .from(financialTransactions)
    .innerJoin(financialAccounts, eq(financialTransactions.accountId, financialAccounts.id))
    .where(eq(financialTransactions.id, id))
    .get();
  if (!row) throw notFound("Transaction");
  return toTx({ ...row.tx, accountName: row.accountName });
}

export function createTransaction(ctx: AppContext, input: TransactionInput): TransactionView {
  if (input.kind === "opening_balance") throw badRequest("INVALID_KIND", "Opening balances are set when an account is created.");
  return ctx.store.tx(() => {
    const acc = getAccountRow(ctx, input.accountId);
    if (acc.archivedAt) throw conflict("ACCOUNT_ARCHIVED", "Restore this account before adding transactions.");
    const row = ctx.store.db
      .insert(financialTransactions)
      .values({
        accountId: input.accountId,
        amountCents: signedAmount(input.kind, input.amountCents),
        kind: input.kind,
        category: input.category ?? "",
        description: input.description ?? "",
        occurredOn: input.occurredOn ?? today(ctx),
        status: input.status ?? "confirmed",
      })
      .returning()
      .get();
    assertProtectedBalance(ctx, input.accountId);
    if (row.status === "confirmed") runProgressHooks(ctx);
    return txView(ctx, row.id);
  });
}

/** Marks a pending (scheduled) transaction as having actually happened. */
export function confirmTransaction(ctx: AppContext, id: number, input: { amountCents?: number; occurredOn?: string } = {}): TransactionView {
  return ctx.store.tx(() => {
    const t = txView(ctx, id);
    if (t.status !== "pending") throw conflict("ALREADY_CONFIRMED", "This transaction is already confirmed.");
    ctx.store.db
      .update(financialTransactions)
      .set({
        status: "confirmed",
        ...(input.amountCents !== undefined ? { amountCents: signedAmount(t.kind, input.amountCents) } : {}),
        ...(input.occurredOn ? { occurredOn: input.occurredOn } : {}),
      })
      .where(eq(financialTransactions.id, id))
      .run();
    assertProtectedBalance(ctx, t.accountId);
    runProgressHooks(ctx);
    return txView(ctx, id);
  });
}

/**
 * Only pending transactions can be deleted. Confirmed history is corrected with a reversing
 * entry instead, so no record of real money silently disappears.
 */
export function deleteTransaction(ctx: AppContext, id: number): void {
  const t = txView(ctx, id);
  if (t.status !== "pending") {
    throw conflict("CONFIRMED_IMMUTABLE", "Confirmed transactions can't be deleted. Add a correction instead.");
  }
  ctx.store.db.delete(financialTransactions).where(eq(financialTransactions.id, id)).run();
}

export function correctTransaction(ctx: AppContext, id: number): TransactionView {
  return ctx.store.tx(() => {
    const t = txView(ctx, id);
    if (t.status !== "confirmed") throw conflict("NOT_CONFIRMED", "Only confirmed transactions need a correction.");
    const row = ctx.store.db
      .insert(financialTransactions)
      .values({ accountId: t.accountId, amountCents: -t.amountCents, kind: "correction", category: t.category, description: `Correction of #${t.id}: ${t.description}`.trim(), occurredOn: today(ctx), status: "confirmed" })
      .returning()
      .get();
    assertProtectedBalance(ctx, t.accountId);
    return txView(ctx, row.id);
  });
}

// ---------- Recurring ----------

const toRecurring = (r: typeof recurringTransactions.$inferSelect): RecurringView => ({
  id: r.id,
  accountId: r.accountId,
  name: r.name,
  amountCents: r.amountCents,
  kind: r.kind,
  category: r.category,
  dayOfMonth: r.dayOfMonth,
  active: r.active,
});

export function listRecurring(ctx: AppContext): RecurringView[] {
  return ctx.store.db.select().from(recurringTransactions).orderBy(asc(recurringTransactions.dayOfMonth)).all().map(toRecurring);
}

export interface RecurringInput {
  accountId: number;
  name: string;
  amountCents: number;
  kind: RecurringView["kind"];
  category?: string;
  dayOfMonth: number;
}

export function createRecurring(ctx: AppContext, input: RecurringInput): RecurringView {
  getAccountRow(ctx, input.accountId);
  const row = ctx.store.db
    .insert(recurringTransactions)
    .values({ ...input, amountCents: signedAmount(input.kind, input.amountCents), category: input.category ?? "" })
    .returning()
    .get();
  generateRecurringForMonth(ctx, monthOf(today(ctx)));
  return toRecurring(row);
}

export function updateRecurring(ctx: AppContext, id: number, patch: Partial<RecurringInput> & { active?: boolean }): RecurringView {
  const cur = ctx.store.db.select().from(recurringTransactions).where(eq(recurringTransactions.id, id)).get();
  if (!cur) throw notFound("Recurring transaction");
  const kind = patch.kind ?? cur.kind;
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (patch.amountCents !== undefined) values.amountCents = signedAmount(kind, patch.amountCents);
  ctx.store.db.update(recurringTransactions).set(values).where(eq(recurringTransactions.id, id)).run();
  return toRecurring(ctx.store.db.select().from(recurringTransactions).where(eq(recurringTransactions.id, id)).get()!);
}

/**
 * Creates this month's *pending* entries from active templates. A scheduled debit order or
 * salary is never assumed to have cleared; the user confirms each one. Idempotent per month.
 */
export function generateRecurringForMonth(ctx: AppContext, month: string): number {
  const active = ctx.store.db.select().from(recurringTransactions).where(eq(recurringTransactions.active, true)).all();
  let created = 0;
  ctx.store.tx(() => {
    for (const r of active) {
      const day = String(Math.min(r.dayOfMonth, 28)).padStart(2, "0");
      const res = ctx.store.db
        .insert(financialTransactions)
        .values({
          accountId: r.accountId,
          amountCents: r.amountCents,
          kind: r.kind,
          category: r.category,
          description: r.name,
          occurredOn: `${month}-${day}`,
          status: "pending",
          recurringId: r.id,
          recurringPeriod: month,
        })
        .onConflictDoNothing()
        .run();
      created += res.changes;
    }
  });
  return created;
}

// ---------- Budgets ----------

export function setBudget(ctx: AppContext, input: { month: string; category: string; limitCents: number | null }): void {
  if (input.limitCents === null) {
    ctx.store.db.delete(budgets).where(and(eq(budgets.month, input.month), eq(budgets.category, input.category))).run();
    return;
  }
  ctx.store.db
    .insert(budgets)
    .values({ month: input.month, category: input.category, limitCents: input.limitCents })
    .onConflictDoUpdate({ target: [budgets.month, budgets.category], set: { limitCents: input.limitCents } })
    .run();
}

/** Copies last month's budget lines into `month` if it has none yet. */
export function carryBudgetForward(ctx: AppContext, month: string): number {
  const has = ctx.store.db.select({ id: budgets.id }).from(budgets).where(eq(budgets.month, month)).get();
  if (has) return 0;
  const prev = ctx.store.db.select().from(budgets).where(eq(budgets.month, shiftMonth(month, -1))).all();
  for (const b of prev) ctx.store.db.insert(budgets).values({ month, category: b.category, limitCents: b.limitCents }).onConflictDoNothing().run();
  return prev.length;
}

export function monthSummary(ctx: AppContext, month: string): MonthSummary {
  const txs = listTransactions(ctx, { month });
  const sum = (filter: (t: TransactionView) => boolean) => txs.filter(filter).reduce((s, t) => s + t.amountCents, 0);
  const protectedIds = new Set(listAccounts(ctx, { includeArchived: true }).filter((a) => a.isProtected).map((a) => a.id));

  const byCategory = new Map<string, BudgetLine>();
  const line = (category: string) => {
    let l = byCategory.get(category);
    if (!l) byCategory.set(category, (l = { category, limitCents: null, spentCents: 0, plannedCents: 0 }));
    return l;
  };
  for (const b of ctx.store.db.select().from(budgets).where(eq(budgets.month, month)).all()) line(b.category).limitCents = b.limitCents;
  for (const t of txs.filter((t) => t.kind === "expense")) {
    const l = line(t.category || "Uncategorised");
    if (t.status === "confirmed") l.spentCents += -t.amountCents;
    else l.plannedCents += -t.amountCents;
  }

  return {
    month,
    incomeCents: sum((t) => t.status === "confirmed" && t.kind === "income"),
    expensesCents: -sum((t) => t.status === "confirmed" && t.kind === "expense"),
    savedCents: sum((t) => t.status === "confirmed" && protectedIds.has(t.accountId) && (t.kind === "deposit" || t.kind === "withdrawal")),
    pendingIncomeCents: sum((t) => t.status === "pending" && t.kind === "income"),
    pendingExpensesCents: -sum((t) => t.status === "pending" && t.kind === "expense"),
    budget: [...byCategory.values()].sort((a, b) => (b.limitCents ?? 0) - (a.limitCents ?? 0) || a.category.localeCompare(b.category)),
  };
}

// ---------- Debts ----------

function debtBalance(ctx: AppContext, debtId: number, starting: number): number {
  const row = ctx.store.db
    .select({ t: sql<number>`COALESCE(SUM(${debtPayments.amountCents}), 0)` })
    .from(debtPayments)
    .where(eq(debtPayments.debtId, debtId))
    .get();
  return Math.max(0, starting - Number(row?.t ?? 0));
}

function toDebt(ctx: AppContext, d: typeof debts.$inferSelect): DebtView {
  const balance = debtBalance(ctx, d.id, d.startingBalanceCents);
  const f = debtPayoff(balance, d.interestRateBps, d.minimumPaymentCents);
  const thisMonth = monthOf(today(ctx));
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    startingBalanceCents: d.startingBalanceCents,
    balanceCents: balance,
    interestRateBps: d.interestRateBps,
    minimumPaymentCents: d.minimumPaymentCents,
    status: d.status,
    payoff: f ? { ...f, month: shiftMonth(thisMonth, f.months) } : null,
  };
}

export function listDebts(ctx: AppContext, opts: { includeArchived?: boolean } = {}): DebtView[] {
  return ctx.store.db
    .select()
    .from(debts)
    .orderBy(asc(debts.id))
    .all()
    .filter((d) => opts.includeArchived || d.status !== "archived")
    .map((d) => toDebt(ctx, d));
}

export interface DebtInput {
  name: string;
  kind?: string;
  startingBalanceCents: number;
  interestRateBps?: number;
  minimumPaymentCents?: number;
}

export function createDebt(ctx: AppContext, input: DebtInput): DebtView {
  const row = ctx.store.db
    .insert(debts)
    .values({ name: input.name, kind: input.kind ?? "loan", startingBalanceCents: input.startingBalanceCents, interestRateBps: input.interestRateBps ?? 0, minimumPaymentCents: input.minimumPaymentCents ?? 0 })
    .returning()
    .get();
  return toDebt(ctx, row);
}

export function updateDebt(ctx: AppContext, id: number, patch: Partial<Omit<DebtInput, "startingBalanceCents">> & { archived?: boolean }): DebtView {
  const d = ctx.store.db.select().from(debts).where(eq(debts.id, id)).get();
  if (!d) throw notFound("Debt");
  const { archived, ...rest } = patch;
  const values: Partial<typeof debts.$inferInsert> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (archived !== undefined) values.status = archived ? "archived" : debtBalance(ctx, id, d.startingBalanceCents) === 0 ? "paid_off" : "active";
  ctx.store.db.update(debts).set(values).where(eq(debts.id, id)).run();
  return toDebt(ctx, ctx.store.db.select().from(debts).where(eq(debts.id, id)).get()!);
}

/**
 * Records a confirmed repayment. Overpayment is refused. When the balance reaches zero the
 * debt is marked paid off and a timeline milestone is written.
 */
export function recordDebtPayment(
  ctx: AppContext,
  debtId: number,
  input: { amountCents: number; paidOn?: string; note?: string; fromAccountId?: number | null },
): DebtView {
  return ctx.store.tx(() => {
    const d = ctx.store.db.select().from(debts).where(eq(debts.id, debtId)).get();
    if (!d) throw notFound("Debt");
    if (d.status !== "active") throw conflict("DEBT_NOT_ACTIVE", "This debt is not active.");
    const before = debtBalance(ctx, debtId, d.startingBalanceCents);
    if (input.amountCents > before) throw conflict("OVERPAYMENT", "That's more than the remaining balance.");
    const paidOn = input.paidOn ?? today(ctx);
    ctx.store.db.insert(debtPayments).values({ debtId, amountCents: input.amountCents, paidOn, note: input.note ?? "" }).run();
    if (input.fromAccountId) {
      createTransaction(ctx, { accountId: input.fromAccountId, amountCents: input.amountCents, kind: "expense", category: "Debt repayment", description: d.name, occurredOn: paidOn });
    }
    if (before - input.amountCents === 0) {
      ctx.store.db.update(debts).set({ status: "paid_off", paidOffAt: ctx.clock.now().toISOString() }).where(eq(debts.id, debtId)).run();
      addTimelineEvent(ctx, { type: "debt_paid_off", title: `Debt-free: ${d.name}`, detail: "Paid off in full.", sourceType: "debt", sourceId: debtId });
    }
    runProgressHooks(ctx);
    return toDebt(ctx, ctx.store.db.select().from(debts).where(eq(debts.id, debtId)).get()!);
  });
}

// ---------- Overview & projections ----------

/** Average confirmed monthly expenses over the last 3 full months, falling back to recurring expenses. */
export function averageMonthlyExpenses(ctx: AppContext): number {
  const month = monthOf(today(ctx));
  const totals = [1, 2, 3].map((i) => monthSummary(ctx, shiftMonth(month, -i)).expensesCents).filter((v) => v > 0);
  if (totals.length) return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  return -listRecurring(ctx)
    .filter((r) => r.active && r.kind === "expense")
    .reduce((s, r) => s + r.amountCents, 0);
}

export function projection(startSavings: number, monthlySavings: number, monthlyNet: number, fromMonth: string, months = 12): ProjectionPoint[] {
  return Array.from({ length: months }, (_, i) => ({
    month: shiftMonth(fromMonth, i + 1),
    savingsCents: startSavings + monthlySavings * (i + 1),
    netCents: monthlyNet,
  }));
}

export function getWealthOverview(ctx: AppContext, month = monthOf(today(ctx))): WealthOverview {
  generateRecurringForMonth(ctx, month);
  carryBudgetForward(ctx, month);
  const settings = getSettings(ctx);
  const accounts = listAccounts(ctx);
  const debtList = listDebts(ctx);
  const totalDebt = debtList.filter((d) => d.status === "active").reduce((s, d) => s + d.balanceCents, 0);
  const protectedBalance = accounts.filter((a) => a.isProtected).reduce((s, a) => s + a.balanceCents, 0);
  const emergencyBalance = accounts.filter((a) => a.type === "emergency").reduce((s, a) => s + a.balanceCents, 0);
  const monthlyExpenses = averageMonthlyExpenses(ctx);
  const recurringNet = listRecurring(ctx)
    .filter((r) => r.active && (r.kind === "income" || r.kind === "expense"))
    .reduce((s, r) => s + r.amountCents, 0);
  const monthlyNet = settings.monthlyIncomeCents !== null ? settings.monthlyIncomeCents - monthlyExpenses : recurringNet;

  return {
    month,
    accounts,
    netWorthCents: accounts.reduce((s, a) => s + a.balanceCents, 0) - totalDebt,
    totalDebtCents: totalDebt,
    summary: monthSummary(ctx, month),
    emergencyFund: { balanceCents: emergencyBalance, targetCents: monthlyExpenses * settings.emergencyFundMonths, months: settings.emergencyFundMonths, monthlyExpensesCents: monthlyExpenses },
    savingsGoals: listSavingsGoals(ctx),
    debts: debtList,
    recurring: listRecurring(ctx),
    projection: projection(protectedBalance, settings.monthlySavingsTargetCents ?? 0, monthlyNet, monthOf(today(ctx))),
    plan: { monthlyIncomeCents: settings.monthlyIncomeCents, monthlySavingsTargetCents: settings.monthlySavingsTargetCents },
  };
}

/** What-if planning: changes nothing, only forecasts. */
export function runScenario(ctx: AppContext, input: { monthlySavingsCents: number; extraDebtPaymentCents?: number; months?: number }): ScenarioResult {
  const thisMonth = monthOf(today(ctx));
  const goals = listSavingsGoals(ctx).map((g) => {
    const m = monthsToTarget(g.savedCents, g.targetCents, input.monthlySavingsCents);
    return { id: g.id, name: g.name, months: m, month: m === null ? null : shiftMonth(thisMonth, m) };
  });
  const debtsOut = listDebts(ctx)
    .filter((d) => d.status === "active")
    .map((d) => {
      const f = debtPayoff(d.balanceCents, d.interestRateBps, d.minimumPaymentCents + (input.extraDebtPaymentCents ?? 0));
      return { id: d.id, name: d.name, months: f?.months ?? null, month: f ? shiftMonth(thisMonth, f.months) : null, totalInterestCents: f?.totalInterestCents ?? null };
    });
  const protectedBalance = listAccounts(ctx).filter((a) => a.isProtected).reduce((s, a) => s + a.balanceCents, 0);
  return { goals, debts: debtsOut, series: projection(protectedBalance, input.monthlySavingsCents, 0, thisMonth, input.months ?? 24) };
}
