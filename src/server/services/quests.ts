import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { questCompletions, questInstances, quests } from "../db/schema.js";
import {
  levelFromXp,
  type CompletionResponse,
  type Quest,
  type QuestDifficulty,
  type QuestFrequency,
  type QuestInstanceView,
  type QuestKind,
  type QuestVerification,
} from "../../shared/types.js";
import { dateInTimezone, isoWeekKey, startOfIsoWeek, weekday } from "../domain/dates.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { getCharacter, recordCredits, recordXp, totalXp } from "./progression.js";
import { getSettings, today } from "./settings.js";
import { addTimelineEvent, removeEventsForSource } from "./timeline.js";
import { runProgressHooks } from "./hooks.js";

type QuestRow = typeof quests.$inferSelect;
type InstanceRow = typeof questInstances.$inferSelect;
type CompletionRow = typeof questCompletions.$inferSelect;

function toQuest(r: QuestRow): Quest {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    categoryId: r.categoryId,
    kind: r.kind,
    difficulty: r.difficulty,
    xpReward: r.xpReward,
    creditReward: r.creditReward,
    frequency: r.frequency,
    recurrenceDays: r.recurrenceDays,
    completionRequirements: r.completionRequirements,
    verification: r.verification,
    dueDate: r.dueDate,
    isOptional: r.isOptional,
    status: r.status,
    isDemo: r.isDemo,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export interface QuestInput {
  title: string;
  description?: string;
  categoryId?: number | null;
  kind?: QuestKind;
  difficulty: QuestDifficulty;
  /** Omit to use the configured default for the difficulty. */
  xpReward?: number;
  creditReward?: number;
  frequency: QuestFrequency;
  recurrenceDays?: number[];
  completionRequirements?: string;
  verification?: QuestVerification;
  dueDate?: string | null;
  isOptional?: boolean;
  isDemo?: boolean;
}

function validateSchedule(frequency: QuestFrequency, recurrenceDays: number[], dueDate: string | null) {
  if (frequency === "custom" && recurrenceDays.length === 0) {
    throw badRequest("RECURRENCE_REQUIRED", "Pick at least one weekday for a custom quest.");
  }
  if (frequency !== "once" && dueDate) {
    throw badRequest("DUE_DATE_ONE_TIME_ONLY", "Only one-time quests can have a due date.");
  }
}

export function createQuest(ctx: AppContext, input: QuestInput): Quest {
  const defaults = getSettings(ctx).difficultyRewards[input.difficulty];
  const recurrenceDays = [...new Set(input.recurrenceDays ?? [])].sort();
  const dueDate = input.dueDate ?? null;
  validateSchedule(input.frequency, recurrenceDays, dueDate);
  const nowIso = ctx.clock.now().toISOString();
  const row = ctx.store.db
    .insert(quests)
    .values({
      title: input.title,
      description: input.description ?? "",
      categoryId: input.categoryId ?? null,
      kind: input.kind ?? "standard",
      difficulty: input.difficulty,
      xpReward: input.xpReward ?? defaults.xp,
      creditReward: input.creditReward ?? defaults.credits,
      frequency: input.frequency,
      recurrenceDays,
      completionRequirements: input.completionRequirements ?? "",
      verification: input.verification ?? "none",
      dueDate,
      isOptional: input.isOptional ?? false,
      isDemo: input.isDemo ?? false,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .returning()
    .get();
  return toQuest(row);
}

export function getQuest(ctx: AppContext, id: number): Quest {
  const row = ctx.store.db.select().from(quests).where(eq(quests.id, id)).get();
  if (!row) throw notFound("Quest");
  return toQuest(row);
}

export function listQuests(ctx: AppContext, opts: { includeArchived?: boolean } = {}): Quest[] {
  const q = ctx.store.db.select().from(quests);
  const rows = (opts.includeArchived ? q : q.where(eq(quests.status, "active"))).orderBy(asc(quests.sortOrder), asc(quests.id)).all();
  return rows.map(toQuest);
}

export type QuestPatch = Partial<Omit<QuestInput, "isDemo">>;

/**
 * Edits apply to future completions only. Past completions keep the XP and credits they
 * actually awarded, so editing a quest can never re-pay or claw back history.
 */
export function updateQuest(ctx: AppContext, id: number, patch: QuestPatch): Quest {
  return ctx.store.tx(() => {
    const current = getQuest(ctx, id);
    if (patch.frequency !== undefined && patch.frequency !== current.frequency) {
      const hasInstances = ctx.store.db.select({ id: questInstances.id }).from(questInstances).where(eq(questInstances.questId, id)).get();
      if (hasInstances) {
        throw conflict(
          "FREQUENCY_LOCKED",
          "This quest already has history, so its frequency can't change. Archive it and create a new quest instead.",
        );
      }
    }
    const frequency = patch.frequency ?? current.frequency;
    const recurrenceDays = patch.recurrenceDays ? [...new Set(patch.recurrenceDays)].sort() : current.recurrenceDays;
    const dueDate = patch.dueDate === undefined ? current.dueDate : patch.dueDate;
    validateSchedule(frequency, recurrenceDays, dueDate);
    const { recurrenceDays: _r, dueDate: _d, ...rest } = patch;
    const values = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    ctx.store.db
      .update(quests)
      .set({ ...values, recurrenceDays, dueDate, updatedAt: ctx.clock.now().toISOString() })
      .where(eq(quests.id, id))
      .run();
    if (frequency === "once" && dueDate) {
      ctx.store.db
        .update(questInstances)
        .set({ scheduledDate: dueDate })
        .where(and(eq(questInstances.questId, id), eq(questInstances.status, "pending")))
        .run();
    }
    return getQuest(ctx, id);
  });
}

export function setQuestArchived(ctx: AppContext, id: number, archived: boolean): Quest {
  getQuest(ctx, id);
  const nowIso = ctx.clock.now().toISOString();
  ctx.store.db
    .update(quests)
    .set({ status: archived ? "archived" : "active", archivedAt: archived ? nowIso : null, updatedAt: nowIso })
    .where(eq(quests.id, id))
    .run();
  return getQuest(ctx, id);
}

/** Moves a one-time quest to a new due date. Recurring quests follow their schedule instead. */
export function rescheduleQuest(ctx: AppContext, id: number, dueDate: string): Quest {
  const quest = getQuest(ctx, id);
  if (quest.frequency !== "once") {
    throw badRequest("RESCHEDULE_ONE_TIME_ONLY", "Only one-time quests can be rescheduled. Skip a recurring quest instead.");
  }
  return updateQuest(ctx, id, { dueDate });
}

// ---------- Instances ----------

function periodFor(quest: QuestRow, date: string, restDays: number[]): { periodKey: string; scheduledDate: string } | null {
  switch (quest.frequency) {
    case "daily":
      return restDays.includes(weekday(date)) ? null : { periodKey: date, scheduledDate: date };
    case "custom":
      return quest.recurrenceDays.includes(weekday(date)) ? { periodKey: date, scheduledDate: date } : null;
    case "weekly":
      return { periodKey: isoWeekKey(date), scheduledDate: startOfIsoWeek(date) };
    case "once":
      return { periodKey: "once", scheduledDate: quest.dueDate ?? date };
  }
}

/**
 * Creates the instances that should exist on `date`. Safe to call repeatedly: the
 * (quest_id, period_key) unique index means each period gets exactly one instance.
 */
export function materializeInstances(ctx: AppContext, date: string): void {
  const { restDays, timezone } = getSettings(ctx);
  const active = ctx.store.db.select().from(quests).where(eq(quests.status, "active")).all();
  ctx.store.tx(() => {
    for (const q of active) {
      // A recurring quest only exists from the day (or, for weekly quests, the week) it was created.
      const created = dateInTimezone(new Date(q.createdAt), timezone);
      if (q.frequency === "weekly" ? startOfIsoWeek(created) > startOfIsoWeek(date) : q.frequency !== "once" && created > date) continue;
      const p = periodFor(q, date, restDays);
      if (!p) continue;
      ctx.store.db
        .insert(questInstances)
        .values({ questId: q.id, periodKey: p.periodKey, scheduledDate: p.scheduledDate })
        .onConflictDoNothing()
        .run();
    }
  });
}

function liveCompletion(ctx: AppContext, instanceId: number): CompletionRow | undefined {
  return ctx.store.db
    .select()
    .from(questCompletions)
    .where(and(eq(questCompletions.instanceId, instanceId), isNull(questCompletions.undoneAt)))
    .get();
}

function toView(ctx: AppContext, inst: InstanceRow, quest: QuestRow, undoHours: number): QuestInstanceView {
  const c = inst.status === "completed" ? liveCompletion(ctx, inst.id) : undefined;
  return {
    instanceId: inst.id,
    periodKey: inst.periodKey,
    scheduledDate: inst.scheduledDate,
    status: inst.status,
    quest: toQuest(quest),
    completion: c
      ? {
          id: c.id,
          completedAt: c.completedAt,
          xpAwarded: c.xpAwarded,
          creditsAwarded: c.creditsAwarded,
          evidenceNote: c.evidenceNote,
          undoableUntil: new Date(new Date(c.completedAt).getTime() + undoHours * 3_600_000).toISOString(),
        }
      : null,
  };
}

/** Quests on the board for `date`: today's dailies, this week's weeklies, and open or just-finished one-time quests. */
export function listInstancesForDate(ctx: AppContext, date: string): QuestInstanceView[] {
  materializeInstances(ctx, date);
  const { timezone, undoWindowHours } = getSettings(ctx);
  const week = isoWeekKey(date);
  const rows = ctx.store.db
    .select({ inst: questInstances, quest: quests })
    .from(questInstances)
    .innerJoin(quests, eq(questInstances.questId, quests.id))
    .where(inArray(questInstances.periodKey, [date, week, "once"]))
    .orderBy(asc(quests.sortOrder), asc(quests.id))
    .all();

  return rows
    .filter(({ inst, quest }) => {
      const changedOn = inst.statusChangedAt ? dateInTimezone(new Date(inst.statusChangedAt), timezone) : null;
      if (quest.status === "archived") return inst.status !== "pending" && changedOn === date;
      if (inst.periodKey !== "once") return true;
      if (inst.status === "pending") return quest.dueDate === null || quest.dueDate <= date;
      return changedOn === date;
    })
    .map(({ inst, quest }) => toView(ctx, inst, quest, undoWindowHours));
}

function loadInstance(ctx: AppContext, instanceId: number): { inst: InstanceRow; quest: QuestRow } {
  const row = ctx.store.db
    .select({ inst: questInstances, quest: quests })
    .from(questInstances)
    .innerJoin(quests, eq(questInstances.questId, quests.id))
    .where(eq(questInstances.id, instanceId))
    .get();
  if (!row) throw notFound("Quest instance");
  return row;
}

export interface CompleteInput {
  evidenceNote?: string;
  /** Required for quests with verification = "confirm". */
  confirmed?: boolean;
}

/**
 * Completes an instance and pays out XP and credits in one transaction.
 * Idempotent: completing an already-completed instance returns the existing state and pays nothing.
 */
export function completeInstance(ctx: AppContext, instanceId: number, input: CompleteInput = {}): CompletionResponse {
  const { undoWindowHours } = getSettings(ctx);
  const xpBefore = totalXp(ctx);
  const result = ctx.store.tx(() => {
    const { inst, quest } = loadInstance(ctx, instanceId);
    if (inst.status === "completed") return { alreadyCompleted: true, xp: 0, credits: 0 };
    if (quest.status === "archived") throw conflict("QUEST_ARCHIVED", "Restore this quest before completing it.");
    if (inst.periodKey !== "once" && inst.scheduledDate > today(ctx)) {
      throw conflict("NOT_YET_DUE", "This quest instance is in the future.");
    }
    const note = input.evidenceNote?.trim() ?? "";
    if (quest.verification === "note" && note === "") {
      throw badRequest("EVIDENCE_REQUIRED", "Add a short note describing what you did to complete this quest.");
    }
    if (quest.verification === "confirm" && input.confirmed !== true) {
      throw badRequest("CONFIRMATION_REQUIRED", "This milestone needs explicit confirmation before it is completed.");
    }

    const nowIso = ctx.clock.now().toISOString();
    const completion = ctx.store.db
      .insert(questCompletions)
      .values({
        instanceId: inst.id,
        questId: quest.id,
        categoryId: quest.categoryId,
        xpAwarded: quest.xpReward,
        creditsAwarded: quest.creditReward,
        evidenceNote: note,
        completedAt: nowIso,
      })
      .returning()
      .get();
    ctx.store.db.update(questInstances).set({ status: "completed", statusChangedAt: nowIso }).where(eq(questInstances.id, inst.id)).run();

    const key = `quest_completion:${completion.id}`;
    recordXp(ctx, { amount: quest.xpReward, categoryId: quest.categoryId, sourceType: "quest_completion", sourceId: completion.id, idempotencyKey: key, note: quest.title });
    recordCredits(ctx, { amount: quest.creditReward, sourceType: "quest_completion", sourceId: completion.id, idempotencyKey: key, note: quest.title });

    addTimelineEvent(ctx, {
      type: "quest_completed",
      title: quest.title,
      detail: `+${quest.xpReward} XP · +${quest.creditReward} credits`,
      categoryId: quest.categoryId,
      sourceType: "quest_completion",
      sourceId: completion.id,
    });
    const before = levelFromXp(xpBefore).level;
    const after = levelFromXp(xpBefore + quest.xpReward).level;
    if (after > before) {
      addTimelineEvent(ctx, {
        type: "level_up",
        title: `Reached level ${after}`,
        detail: `Unlocked by completing "${quest.title}".`,
        sourceType: "quest_completion",
        sourceId: completion.id,
      });
    }
    runProgressHooks(ctx);
    return { alreadyCompleted: false, xp: quest.xpReward, credits: quest.creditReward };
  });

  const { inst, quest } = loadInstance(ctx, instanceId);
  const levelBefore = levelFromXp(xpBefore).level;
  const levelAfter = levelFromXp(xpBefore + result.xp).level;
  return {
    instance: toView(ctx, inst, quest, undoWindowHours),
    alreadyCompleted: result.alreadyCompleted,
    delta: { xpGained: result.xp, creditsGained: result.credits, levelBefore, levelAfter, leveledUp: levelAfter > levelBefore },
    character: getCharacter(ctx),
  };
}

/**
 * Reverses a completion within the undo window. The original ledger rows stay; matching
 * negative entries are appended so the history remains auditable.
 */
export function undoInstance(ctx: AppContext, instanceId: number): CompletionResponse {
  const { undoWindowHours } = getSettings(ctx);
  const xpBefore = totalXp(ctx);
  const result = ctx.store.tx(() => {
    const { inst, quest } = loadInstance(ctx, instanceId);
    const completion = liveCompletion(ctx, inst.id);
    if (inst.status !== "completed" || !completion) throw conflict("NOT_COMPLETED", "This quest is not completed.");
    const deadline = new Date(completion.completedAt).getTime() + undoWindowHours * 3_600_000;
    if (ctx.clock.now().getTime() > deadline) {
      throw conflict("UNDO_WINDOW_PASSED", `Completions can only be undone within ${undoWindowHours} hours.`);
    }
    const nowIso = ctx.clock.now().toISOString();
    ctx.store.db.update(questCompletions).set({ undoneAt: nowIso }).where(eq(questCompletions.id, completion.id)).run();
    ctx.store.db.update(questInstances).set({ status: "pending", statusChangedAt: nowIso }).where(eq(questInstances.id, inst.id)).run();

    const key = `quest_undo:${completion.id}`;
    recordXp(ctx, { amount: -completion.xpAwarded, categoryId: completion.categoryId, sourceType: "quest_undo", sourceId: completion.id, idempotencyKey: key, note: `Undo: ${quest.title}` });
    try {
      recordCredits(ctx, { amount: -completion.creditsAwarded, sourceType: "quest_undo", sourceId: completion.id, idempotencyKey: key, note: `Undo: ${quest.title}` });
    } catch (err) {
      throw conflict("CREDITS_ALREADY_SPENT", "The credits from this quest have already been spent, so it can't be undone.", err);
    }
    removeEventsForSource(ctx, "quest_completion", completion.id);
    return { xp: -completion.xpAwarded, credits: -completion.creditsAwarded };
  });

  const { inst, quest } = loadInstance(ctx, instanceId);
  const levelBefore = levelFromXp(xpBefore).level;
  const levelAfter = levelFromXp(xpBefore + result.xp).level;
  return {
    instance: toView(ctx, inst, quest, undoWindowHours),
    alreadyCompleted: false,
    delta: { xpGained: result.xp, creditsGained: result.credits, levelBefore, levelAfter, leveledUp: false },
    character: getCharacter(ctx),
  };
}

/** Marks an instance as skipped (no payout, no penalty), or restores a skipped one to pending. */
export function setInstanceSkipped(ctx: AppContext, instanceId: number, skipped: boolean): QuestInstanceView {
  const { undoWindowHours } = getSettings(ctx);
  return ctx.store.tx(() => {
    const { inst, quest } = loadInstance(ctx, instanceId);
    if (inst.status === "completed") throw conflict("ALREADY_COMPLETED", "Undo the completion before skipping this quest.");
    const status = skipped ? "skipped" : "pending";
    if (inst.status !== status) {
      ctx.store.db
        .update(questInstances)
        .set({ status, statusChangedAt: ctx.clock.now().toISOString() })
        .where(eq(questInstances.id, inst.id))
        .run();
    }
    const fresh = loadInstance(ctx, instanceId);
    return toView(ctx, fresh.inst, fresh.quest, undoWindowHours);
  });
}

export function countActiveDailyQuests(ctx: AppContext): number {
  const row = ctx.store.db
    .select({ n: sql<number>`COUNT(*)` })
    .from(quests)
    .where(and(eq(quests.status, "active"), inArray(quests.frequency, ["daily", "custom"]), eq(quests.isOptional, false)))
    .get();
  return Number(row?.n ?? 0);
}

/** Completions per day for the 7 days ending on `endDate`, in the user's timezone. */
export function weeklyActivity(ctx: AppContext, dates: string[]): Array<{ date: string; completed: number; xp: number }> {
  const { timezone } = getSettings(ctx);
  const since = new Date(ctx.clock.now().getTime() - 9 * 86_400_000).toISOString();
  const rows = ctx.store.db
    .select({ completedAt: questCompletions.completedAt, xp: questCompletions.xpAwarded })
    .from(questCompletions)
    .where(and(isNull(questCompletions.undoneAt), sql`${questCompletions.completedAt} >= ${since}`))
    .all();
  const map = new Map(dates.map((d) => [d, { date: d, completed: 0, xp: 0 }]));
  for (const r of rows) {
    const entry = map.get(dateInTimezone(new Date(r.completedAt), timezone));
    if (entry) {
      entry.completed += 1;
      entry.xp += r.xp;
    }
  }
  return [...map.values()];
}

/** One-time quests with a future due date, soonest first. */
export function listUpcoming(ctx: AppContext, date: string, limit = 10): QuestInstanceView[] {
  materializeInstances(ctx, date);
  const { undoWindowHours } = getSettings(ctx);
  return ctx.store.db
    .select({ inst: questInstances, quest: quests })
    .from(questInstances)
    .innerJoin(quests, eq(questInstances.questId, quests.id))
    .where(and(eq(questInstances.periodKey, "once"), eq(questInstances.status, "pending"), eq(quests.status, "active"), sql`${quests.dueDate} > ${date}`))
    .orderBy(asc(quests.dueDate))
    .limit(limit)
    .all()
    .map(({ inst, quest }) => toView(ctx, inst, quest, undoWindowHours));
}
