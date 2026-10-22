import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { achievementUnlocks, questCompletions, seasonGoals, seasonReviews, seasons, xpTransactions } from "../db/schema.js";
import type { SeasonStatus, SeasonSummary, SeasonView } from "../../shared/types.js";
import { addDays, dateInTimezone, daysBetween, startOfIsoWeek } from "../domain/dates.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { runProgressHooks } from "./hooks.js";
import { computeMetrics } from "./metrics.js";
import { getSettings, today } from "./settings.js";
import { addTimelineEvent } from "./timeline.js";

// Seasons are a lens on progress, never a reset: lifetime XP, credits, achievements and
// financial records are untouched by creating, completing or archiving a season.

export const SEASON_DAYS = 90;
const MAX_PRIMARY = 3;

type SeasonRow = typeof seasons.$inferSelect;

/** UTC timestamp bounds covering the season's calendar days in the user's timezone (generous by a day each side, then filtered). */
function inSeason(ctx: AppContext, s: SeasonRow, iso: string): boolean {
  const d = dateInTimezone(new Date(iso), getSettings(ctx).timezone);
  return d >= s.startDate && d <= s.endDate;
}

function seasonXpRows(ctx: AppContext, s: SeasonRow) {
  const from = `${addDays(s.startDate, -1)}T00:00:00.000Z`;
  const to = `${addDays(s.endDate, 1)}T23:59:59.999Z`;
  return ctx.store.db
    .select({ amount: xpTransactions.amount, createdAt: xpTransactions.createdAt })
    .from(xpTransactions)
    .where(and(sql`${xpTransactions.createdAt} >= ${from}`, sql`${xpTransactions.createdAt} <= ${to}`))
    .all()
    .filter((r) => inSeason(ctx, s, r.createdAt));
}

function seasonCompletions(ctx: AppContext, s: SeasonRow): number {
  const from = `${addDays(s.startDate, -1)}T00:00:00.000Z`;
  const to = `${addDays(s.endDate, 1)}T23:59:59.999Z`;
  return ctx.store.db
    .select({ completedAt: questCompletions.completedAt })
    .from(questCompletions)
    .where(and(isNull(questCompletions.undoneAt), sql`${questCompletions.completedAt} >= ${from}`, sql`${questCompletions.completedAt} <= ${to}`))
    .all()
    .filter((r) => inSeason(ctx, s, r.completedAt)).length;
}

function toView(ctx: AppContext, s: SeasonRow): SeasonView {
  const date = today(ctx);
  const xpRows = seasonXpRows(ctx, s);
  const { timezone } = getSettings(ctx);
  const weekly = new Map<string, number>();
  for (let w = startOfIsoWeek(s.startDate); w <= s.endDate; w = addDays(w, 7)) weekly.set(w, 0);
  for (const r of xpRows) {
    const w = startOfIsoWeek(dateInTimezone(new Date(r.createdAt), timezone));
    weekly.set(w, (weekly.get(w) ?? 0) + r.amount);
  }
  const totalDays = daysBetween(s.startDate, s.endDate) + 1;
  return {
    id: s.id,
    name: s.name,
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    theme: s.theme,
    celebration: s.celebration,
    dayNumber: Math.min(totalDays, Math.max(0, daysBetween(s.startDate, date) + 1)),
    totalDays,
    goals: ctx.store.db
      .select()
      .from(seasonGoals)
      .where(eq(seasonGoals.seasonId, s.id))
      .orderBy(desc(seasonGoals.isPrimary), asc(seasonGoals.sortOrder), asc(seasonGoals.id))
      .all()
      .map((g) => ({ id: g.id, title: g.title, isPrimary: g.isPrimary, status: g.status })),
    reviews: ctx.store.db
      .select()
      .from(seasonReviews)
      .where(eq(seasonReviews.seasonId, s.id))
      .orderBy(desc(seasonReviews.weekStart))
      .all()
      .map((r) => ({ id: r.id, weekStart: r.weekStart, wins: r.wins, challenges: r.challenges, nextFocus: r.nextFocus, rating: r.rating })),
    xp: xpRows.reduce((sum, r) => sum + r.amount, 0),
    questsCompleted: seasonCompletions(ctx, s),
    weeklyXp: [...weekly.entries()].map(([weekStart, xp]) => ({ weekStart, xp })),
    summary: (s.summary as SeasonSummary | null) ?? null,
    completedAt: s.completedAt,
  };
}

function getRow(ctx: AppContext, id: number): SeasonRow {
  const s = ctx.store.db.select().from(seasons).where(eq(seasons.id, id)).get();
  if (!s) throw notFound("Season");
  return s;
}

export function getSeason(ctx: AppContext, id: number): SeasonView {
  return toView(ctx, getRow(ctx, id));
}

export function listSeasons(ctx: AppContext): SeasonView[] {
  const order = sql`CASE ${seasons.status} WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END`;
  return ctx.store.db.select().from(seasons).orderBy(order, desc(seasons.startDate)).all().map((s) => toView(ctx, s));
}

export interface SeasonInput {
  name: string;
  startDate: string;
  endDate?: string;
  theme?: string;
  celebration?: string;
  goals?: Array<{ title: string; isPrimary?: boolean }>;
  activate?: boolean;
}

function assertPrimaryLimit(count: number) {
  if (count > MAX_PRIMARY) throw badRequest("TOO_MANY_PRIMARY", `A season has at most ${MAX_PRIMARY} primary objectives. Make the rest secondary.`);
}

export function createSeason(ctx: AppContext, input: SeasonInput): SeasonView {
  const endDate = input.endDate ?? addDays(input.startDate, SEASON_DAYS - 1);
  if (endDate < input.startDate) throw badRequest("INVALID_DATES", "The season must end after it starts.");
  const goals = input.goals ?? [];
  assertPrimaryLimit(goals.filter((g) => g.isPrimary).length);
  return ctx.store.tx(() => {
    const row = ctx.store.db
      .insert(seasons)
      .values({ name: input.name, startDate: input.startDate, endDate, theme: input.theme ?? "", celebration: input.celebration ?? "" })
      .returning()
      .get();
    goals.forEach((g, i) => ctx.store.db.insert(seasonGoals).values({ seasonId: row.id, title: g.title, isPrimary: g.isPrimary ?? false, sortOrder: i }).run());
    if (input.activate) return activateSeason(ctx, row.id);
    return toView(ctx, row);
  });
}

export function updateSeason(ctx: AppContext, id: number, patch: Partial<Omit<SeasonInput, "goals" | "activate">>): SeasonView {
  const s = getRow(ctx, id);
  if (s.status === "completed" || s.status === "archived") throw conflict("SEASON_CLOSED", "Completed seasons are kept as a record and can't be edited.");
  const start = patch.startDate ?? s.startDate;
  const end = patch.endDate ?? s.endDate;
  if (end < start) throw badRequest("INVALID_DATES", "The season must end after it starts.");
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  ctx.store.db.update(seasons).set(values).where(eq(seasons.id, id)).run();
  return getSeason(ctx, id);
}

/** Makes a planned season the active one. Only one season can be active at a time. */
export function activateSeason(ctx: AppContext, id: number): SeasonView {
  return ctx.store.tx(() => {
    const s = getRow(ctx, id);
    if (s.status !== "planned") throw conflict("NOT_PLANNED", "Only a planned season can be started.");
    const active = ctx.store.db.select().from(seasons).where(and(eq(seasons.status, "active"), ne(seasons.id, id))).get();
    if (active) throw conflict("SEASON_ACTIVE", `“${active.name}” is still active. Complete it first.`);
    ctx.store.db.update(seasons).set({ status: "active" }).where(eq(seasons.id, id)).run();
    addTimelineEvent(ctx, { type: "season_started", title: `Season started: ${s.name}`, detail: `${s.startDate} → ${s.endDate}`, sourceType: "season", sourceId: id });
    return getSeason(ctx, id);
  });
}

/** Ends a season and freezes its summary. Lifetime progress is untouched. */
export function completeSeason(ctx: AppContext, id: number): SeasonView {
  return ctx.store.tx(() => {
    const s = getRow(ctx, id);
    if (s.status !== "active") throw conflict("NOT_ACTIVE", "Only the active season can be completed.");
    const view = toView(ctx, s);
    const metrics = computeMetrics(ctx);
    const from = `${addDays(s.startDate, -1)}T00:00:00.000Z`;
    const achievementsUnlocked = ctx.store.db
      .select({ at: achievementUnlocks.unlockedAt })
      .from(achievementUnlocks)
      .where(sql`${achievementUnlocks.unlockedAt} >= ${from}`)
      .all()
      .filter((a) => inSeason(ctx, s, a.at)).length;
    const summary: SeasonSummary = {
      xpEarned: view.xp,
      questsCompleted: view.questsCompleted,
      goalsAchieved: view.goals.filter((g) => g.status === "achieved").length,
      goalsTotal: view.goals.filter((g) => g.status !== "dropped").length,
      levelAtEnd: metrics.level,
      savingsAtEndCents: metrics.savingsTotalCents,
      achievementsUnlocked,
      reviewsWritten: view.reviews.length,
    };
    const nowIso = ctx.clock.now().toISOString();
    ctx.store.db.update(seasons).set({ status: "completed", summary: { ...summary }, completedAt: nowIso }).where(eq(seasons.id, id)).run();
    addTimelineEvent(ctx, {
      type: "season_completed",
      title: `Season complete: ${s.name}`,
      detail: `${summary.xpEarned.toLocaleString("en-ZA")} XP · ${summary.goalsAchieved}/${summary.goalsTotal} objectives${s.celebration ? ` · Celebrate: ${s.celebration}` : ""}`,
      sourceType: "season",
      sourceId: id,
      data: { ...summary },
    });
    runProgressHooks(ctx);
    return getSeason(ctx, id);
  });
}

export function setSeasonArchived(ctx: AppContext, id: number, archived: boolean): SeasonView {
  const s = getRow(ctx, id);
  if (archived) {
    if (s.status === "active") throw conflict("SEASON_ACTIVE", "Complete the season before archiving it.");
    if (s.status !== "archived") ctx.store.db.update(seasons).set({ status: "archived", statusBeforeArchive: s.status }).where(eq(seasons.id, id)).run();
  } else if (s.status === "archived") {
    ctx.store.db.update(seasons).set({ status: (s.statusBeforeArchive as SeasonStatus | null) ?? "planned", statusBeforeArchive: null }).where(eq(seasons.id, id)).run();
  }
  return getSeason(ctx, id);
}

// ---------- Goals ----------

function assertOpen(s: SeasonRow) {
  if (s.status === "completed" || s.status === "archived") throw conflict("SEASON_CLOSED", "This season is closed.");
}

export function addSeasonGoal(ctx: AppContext, seasonId: number, input: { title: string; isPrimary?: boolean }): SeasonView {
  const s = getRow(ctx, seasonId);
  assertOpen(s);
  if (input.isPrimary) {
    const n = ctx.store.db.select({ id: seasonGoals.id }).from(seasonGoals).where(and(eq(seasonGoals.seasonId, seasonId), eq(seasonGoals.isPrimary, true), ne(seasonGoals.status, "dropped"))).all().length;
    assertPrimaryLimit(n + 1);
  }
  ctx.store.db.insert(seasonGoals).values({ seasonId, title: input.title, isPrimary: input.isPrimary ?? false, sortOrder: 999 }).run();
  return getSeason(ctx, seasonId);
}

/** Goals can change as life changes: rename, re-prioritise, mark achieved or drop (kept for the record). */
export function updateSeasonGoal(ctx: AppContext, goalId: number, patch: { title?: string; isPrimary?: boolean; status?: "open" | "achieved" | "dropped" }): SeasonView {
  const g = ctx.store.db.select().from(seasonGoals).where(eq(seasonGoals.id, goalId)).get();
  if (!g) throw notFound("Season goal");
  const s = getRow(ctx, g.seasonId);
  assertOpen(s);
  if (patch.isPrimary && !g.isPrimary) {
    const n = ctx.store.db.select({ id: seasonGoals.id }).from(seasonGoals).where(and(eq(seasonGoals.seasonId, s.id), eq(seasonGoals.isPrimary, true), ne(seasonGoals.status, "dropped"))).all().length;
    assertPrimaryLimit(n + 1);
  }
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  ctx.store.db.update(seasonGoals).set(values).where(eq(seasonGoals.id, goalId)).run();
  if (patch.status === "achieved" && g.status !== "achieved") {
    addTimelineEvent(ctx, { type: "season_goal", title: `Season objective achieved: ${g.title}`, detail: s.name, sourceType: "season_goal", sourceId: g.id });
  }
  return getSeason(ctx, s.id);
}

// ---------- Weekly reviews ----------

export function saveWeeklyReview(
  ctx: AppContext,
  seasonId: number,
  input: { weekOf?: string; wins?: string; challenges?: string; nextFocus?: string; rating?: number | null },
): SeasonView {
  const s = getRow(ctx, seasonId);
  if (s.status === "archived") throw conflict("SEASON_CLOSED", "Archived seasons are read-only.");
  const weekStart = startOfIsoWeek(input.weekOf ?? today(ctx));
  if (addDays(weekStart, 6) < s.startDate || weekStart > s.endDate) throw badRequest("OUTSIDE_SEASON", "That week isn't part of this season.");
  const values = { wins: input.wins ?? "", challenges: input.challenges ?? "", nextFocus: input.nextFocus ?? "", rating: input.rating ?? null, updatedAt: ctx.clock.now().toISOString() };
  ctx.store.db
    .insert(seasonReviews)
    .values({ seasonId, weekStart, ...values })
    .onConflictDoUpdate({ target: [seasonReviews.seasonId, seasonReviews.weekStart], set: values })
    .run();
  return getSeason(ctx, seasonId);
}

export function activeSeason(ctx: AppContext): SeasonView | null {
  const s = ctx.store.db.select().from(seasons).where(eq(seasons.status, "active")).get();
  return s ? toView(ctx, s) : null;
}

export function seasonIdsOpen(ctx: AppContext): number[] {
  return ctx.store.db.select({ id: seasons.id }).from(seasons).where(inArray(seasons.status, ["planned", "active"])).all().map((r) => r.id);
}
