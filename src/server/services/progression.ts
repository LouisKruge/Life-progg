import { isNull, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { creditTransactions, questCompletions, xpTransactions } from "../db/schema.js";
import { levelFromXp, rankForLevel, type Character } from "../../shared/types.js";
import { conflict } from "../errors.js";
import { getSettings, listCategories } from "./settings.js";
import { dateInTimezone } from "../domain/dates.js";

type SourceType = "quest_completion" | "quest_undo" | "adjustment" | "redemption" | "refund";

export interface LedgerEntryInput {
  amount: number;
  sourceType: SourceType;
  sourceId: number | null;
  idempotencyKey: string;
  note?: string;
}

export function totalXp({ store }: AppContext): number {
  const row = store.db.select({ total: sql<number>`COALESCE(SUM(${xpTransactions.amount}), 0)` }).from(xpTransactions).get();
  return Number(row?.total ?? 0);
}

export function creditBalance({ store }: AppContext): number {
  const row = store.db
    .select({ total: sql<number>`COALESCE(SUM(${creditTransactions.amount}), 0)` })
    .from(creditTransactions)
    .get();
  return Number(row?.total ?? 0);
}

/**
 * Appends an XP entry. Must run inside `store.tx`. The unique idempotency key makes a
 * duplicate award fail loudly instead of silently paying twice.
 */
export function recordXp(ctx: AppContext, entry: LedgerEntryInput & { categoryId: number | null }): void {
  if (entry.amount === 0) return;
  ctx.store.db
    .insert(xpTransactions)
    .values({
      amount: entry.amount,
      categoryId: entry.categoryId,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      idempotencyKey: entry.idempotencyKey,
      note: entry.note ?? "",
    })
    .run();
}

/** Appends a credit entry and enforces that the wallet never goes negative. Must run inside `store.tx`. */
export function recordCredits(ctx: AppContext, entry: LedgerEntryInput): void {
  if (entry.amount === 0) return;
  ctx.store.db
    .insert(creditTransactions)
    .values({
      amount: entry.amount,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      idempotencyKey: entry.idempotencyKey,
      note: entry.note ?? "",
    })
    .run();
  const balance = creditBalance(ctx);
  if (balance < 0) {
    // Throwing inside the transaction rolls back this entry and everything before it.
    throw conflict("INSUFFICIENT_CREDITS", "This would make your credit balance negative.", { balance: balance - entry.amount });
  }
}

export function getCharacter(ctx: AppContext): Character {
  const settings = getSettings(ctx);
  const xp = totalXp(ctx);
  const level = levelFromXp(xp);
  const { current, next } = rankForLevel(level.level, settings.rankThresholds);

  const byCategory = new Map(
    ctx.store.db
      .select({ categoryId: xpTransactions.categoryId, xp: sql<number>`SUM(${xpTransactions.amount})` })
      .from(xpTransactions)
      .groupBy(xpTransactions.categoryId)
      .all()
      .map((r) => [r.categoryId, Number(r.xp)]),
  );

  const live = ctx.store.db
    .select({ completedAt: questCompletions.completedAt, credits: questCompletions.creditsAwarded })
    .from(questCompletions)
    .where(isNull(questCompletions.undoneAt))
    .all();
  const activeDays = new Set(live.map((c) => dateInTimezone(new Date(c.completedAt), settings.timezone))).size;

  return {
    displayName: settings.displayName,
    rank: current,
    nextRank: next,
    credits: creditBalance(ctx),
    level,
    categories: listCategories(ctx).map((c) => {
      const catXp = Math.max(0, byCategory.get(c.id) ?? 0);
      return { ...c, xp: catXp, level: levelFromXp(catXp).level };
    }),
    stats: {
      questsCompleted: live.length,
      activeDays,
      lifetimeCreditsEarned: live.reduce((sum, c) => sum + c.credits, 0),
    },
  };
}

export interface LedgerRow {
  id: number;
  ledger: "xp" | "credits";
  amount: number;
  sourceType: string;
  note: string;
  createdAt: string;
}

/** Combined, newest-first view of both ledgers for the character history. */
export function listLedger(ctx: AppContext, limit = 50): LedgerRow[] {
  const xp = ctx.store.db.select().from(xpTransactions).orderBy(sql`${xpTransactions.id} DESC`).limit(limit).all();
  const cr = ctx.store.db.select().from(creditTransactions).orderBy(sql`${creditTransactions.id} DESC`).limit(limit).all();
  return [
    ...xp.map((r) => ({ id: r.id, ledger: "xp" as const, amount: r.amount, sourceType: r.sourceType, note: r.note, createdAt: r.createdAt })),
    ...cr.map((r) => ({ id: r.id, ledger: "credits" as const, amount: r.amount, sourceType: r.sourceType, note: r.note, createdAt: r.createdAt })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .slice(0, limit);
}
