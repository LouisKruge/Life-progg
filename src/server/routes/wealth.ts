import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import * as v from "../validation.js";
import {
  confirmTransaction,
  correctTransaction,
  createAccountWithBalance,
  createDebt,
  createRecurring,
  createTransaction,
  deleteTransaction,
  getWealthOverview,
  listAccounts,
  listDebts,
  listTransactions,
  recordDebtPayment,
  runScenario,
  setBudget,
  updateAccount,
  updateDebt,
  updateRecurring,
} from "../services/wealth.js";
import { idOf, parse } from "./util.js";

export function wealthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/wealth", async (req) => {
    const month = (req.query as { month?: string }).month;
    return getWealthOverview(ctx, month ? parse(v.monthString, month) : undefined);
  });
  app.get("/api/accounts", async () => listAccounts(ctx, { includeArchived: true }));
  app.post("/api/accounts", async (req, reply) => reply.code(201).send(createAccountWithBalance(ctx, parse(v.accountSchema, req.body))));
  app.patch("/api/accounts/:id", async (req) => updateAccount(ctx, idOf(req), parse(v.accountPatchSchema, req.body)));

  app.get("/api/transactions", async (req) => {
    const q = req.query as { month?: string; accountId?: string };
    return listTransactions(ctx, { month: q.month ? parse(v.monthString, q.month) : undefined, accountId: q.accountId ? Number(q.accountId) : undefined });
  });
  app.post("/api/transactions", async (req, reply) => reply.code(201).send(createTransaction(ctx, parse(v.transactionSchema, req.body))));
  app.post("/api/transactions/:id/confirm", async (req) => confirmTransaction(ctx, idOf(req), parse(v.confirmTransactionSchema, req.body ?? undefined)));
  app.post("/api/transactions/:id/correct", async (req) => correctTransaction(ctx, idOf(req)));
  app.delete("/api/transactions/:id", async (req, reply) => {
    deleteTransaction(ctx, idOf(req));
    return reply.code(204).send();
  });

  app.post("/api/recurring", async (req, reply) => reply.code(201).send(createRecurring(ctx, parse(v.recurringSchema, req.body))));
  app.patch("/api/recurring/:id", async (req) => updateRecurring(ctx, idOf(req), parse(v.recurringPatchSchema, req.body)));

  app.put("/api/budgets", async (req) => {
    setBudget(ctx, parse(v.budgetSchema, req.body));
    return { ok: true };
  });

  app.get("/api/debts", async () => listDebts(ctx, { includeArchived: true }));
  app.post("/api/debts", async (req, reply) => reply.code(201).send(createDebt(ctx, parse(v.debtSchema, req.body))));
  app.patch("/api/debts/:id", async (req) => updateDebt(ctx, idOf(req), parse(v.debtPatchSchema, req.body)));
  app.post("/api/debts/:id/payments", async (req) => recordDebtPayment(ctx, idOf(req), parse(v.debtPaymentSchema, req.body)));

  app.post("/api/wealth/scenario", async (req) => runScenario(ctx, parse(v.scenarioSchema, req.body)));
}
