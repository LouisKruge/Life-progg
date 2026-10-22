import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { makeCtx } from "../helpers.js";
import {
  completeInstance,
  createQuest,
  listInstancesForDate,
  listUpcoming,
  materializeInstances,
  rescheduleQuest,
  setInstanceSkipped,
  setQuestArchived,
  undoInstance,
  updateQuest,
} from "../../src/server/services/quests.js";
import { creditBalance, getCharacter, recordCredits, totalXp } from "../../src/server/services/progression.js";
import { updateSettings } from "../../src/server/services/settings.js";
import { creditTransactions, questInstances, xpTransactions } from "../../src/server/db/schema.js";
import { AppError } from "../../src/server/errors.js";

let ctx: ReturnType<typeof makeCtx>;
beforeEach(() => {
  ctx = makeCtx();
});

const TODAY = "2026-10-22";

function dailyQuest(overrides = {}) {
  return createQuest(ctx, { title: "Train", difficulty: "medium", frequency: "daily", xpReward: 100, creditReward: 10, ...overrides });
}

function instanceFor(questId: number, date = TODAY) {
  const inst = listInstancesForDate(ctx, date).find((i) => i.quest.id === questId);
  if (!inst) throw new Error("instance not on board");
  return inst;
}

function expectAppError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe("quest completion", () => {
  it("grants the quest's XP and credits", () => {
    const q = dailyQuest();
    const res = completeInstance(ctx, instanceFor(q.id).instanceId);
    expect(res.alreadyCompleted).toBe(false);
    expect(res.delta).toMatchObject({ xpGained: 100, creditsGained: 10 });
    expect(totalXp(ctx)).toBe(100);
    expect(creditBalance(ctx)).toBe(10);
    expect(res.character.level.totalXp).toBe(100);
  });

  it("is idempotent: completing twice pays once", () => {
    const q = dailyQuest();
    const id = instanceFor(q.id).instanceId;
    completeInstance(ctx, id);
    const again = completeInstance(ctx, id);
    for (let i = 0; i < 10; i++) completeInstance(ctx, id);
    expect(again.alreadyCompleted).toBe(true);
    expect(again.delta.xpGained).toBe(0);
    expect(totalXp(ctx)).toBe(100);
    expect(creditBalance(ctx)).toBe(10);
  });

  it("creates distinct instances per day for recurring quests without duplicates", () => {
    const q = dailyQuest();
    materializeInstances(ctx, TODAY);
    materializeInstances(ctx, TODAY);
    completeInstance(ctx, instanceFor(q.id).instanceId);

    ctx.clock.advanceHours(24);
    const tomorrow = instanceFor(q.id, "2026-10-23");
    expect(tomorrow.status).toBe("pending");
    completeInstance(ctx, tomorrow.instanceId);

    const count = ctx.store.db.select({ n: sql<number>`COUNT(*)` }).from(questInstances).get();
    expect(count?.n).toBe(2);
    expect(totalXp(ctx)).toBe(200);
  });

  it("weekly quests share one instance for the whole ISO week", () => {
    const q = createQuest(ctx, { title: "Review", difficulty: "easy", frequency: "weekly" });
    const mon = instanceFor(q.id, "2026-10-19");
    const sun = instanceFor(q.id, "2026-10-25");
    expect(mon.instanceId).toBe(sun.instanceId);
    expect(instanceFor(q.id, "2026-10-26").instanceId).not.toBe(mon.instanceId);
  });

  it("does not generate daily quests on rest days", () => {
    updateSettings(ctx, { restDays: [4] }); // Thursday
    const q = dailyQuest();
    expect(listInstancesForDate(ctx, TODAY).some((i) => i.quest.id === q.id)).toBe(false);
  });

  it("applies the default rewards for the difficulty when none are given", () => {
    const q = createQuest(ctx, { title: "Hard thing", difficulty: "hard", frequency: "once" });
    expect(q).toMatchObject({ xpReward: 200, creditReward: 20 });
  });

  it("requires evidence or confirmation when the quest asks for it", () => {
    const noted = dailyQuest({ title: "Journal", verification: "note" });
    expectAppError(() => completeInstance(ctx, instanceFor(noted.id).instanceId), "EVIDENCE_REQUIRED");
    expect(completeInstance(ctx, instanceFor(noted.id).instanceId, { evidenceNote: "Wrote 2 pages" }).instance.completion?.evidenceNote).toBe(
      "Wrote 2 pages",
    );

    const milestone = createQuest(ctx, { title: "Launch site", difficulty: "epic", frequency: "once", kind: "milestone", verification: "confirm" });
    expectAppError(() => completeInstance(ctx, instanceFor(milestone.id).instanceId), "CONFIRMATION_REQUIRED");
    expect(completeInstance(ctx, instanceFor(milestone.id).instanceId, { confirmed: true }).delta.xpGained).toBe(400);
  });

  it("records a level-up when the threshold is crossed", () => {
    const q = createQuest(ctx, { title: "Big", difficulty: "epic", frequency: "once", xpReward: 600 });
    const res = completeInstance(ctx, instanceFor(q.id).instanceId);
    expect(res.delta).toMatchObject({ levelBefore: 1, levelAfter: 2, leveledUp: true });
    expect(getCharacter(ctx).level.level).toBe(2);
  });

  it("tracks category XP separately from lifetime XP", () => {
    const wealth = getCharacter(ctx).categories.find((c) => c.key === "wealth")!;
    const q = dailyQuest({ categoryId: wealth.id });
    completeInstance(ctx, instanceFor(q.id).instanceId);
    const c = getCharacter(ctx);
    expect(c.categories.find((x) => x.key === "wealth")?.xp).toBe(100);
    expect(c.categories.find((x) => x.key === "mind")?.xp).toBe(0);
  });
});

describe("undo", () => {
  it("reverses XP and credits with auditable ledger entries", () => {
    const q = dailyQuest();
    const id = instanceFor(q.id).instanceId;
    completeInstance(ctx, id);
    const res = undoInstance(ctx, id);
    expect(res.instance.status).toBe("pending");
    expect(totalXp(ctx)).toBe(0);
    expect(creditBalance(ctx)).toBe(0);
    expect(ctx.store.db.select().from(xpTransactions).all()).toHaveLength(2);
    // Re-completing after an undo is a fresh, legitimate payout.
    completeInstance(ctx, id);
    expect(totalXp(ctx)).toBe(100);
  });

  it("is refused after the undo window", () => {
    const q = dailyQuest();
    const id = instanceFor(q.id).instanceId;
    completeInstance(ctx, id);
    ctx.clock.advanceHours(25);
    expectAppError(() => undoInstance(ctx, id), "UNDO_WINDOW_PASSED");
    expect(totalXp(ctx)).toBe(100);
  });

  it("is refused when the credits were already spent, leaving everything unchanged", () => {
    const q = dailyQuest();
    const id = instanceFor(q.id).instanceId;
    completeInstance(ctx, id);
    ctx.store.tx(() => recordCredits(ctx, { amount: -10, sourceType: "redemption", sourceId: null, idempotencyKey: "spend-1" }));
    expectAppError(() => undoInstance(ctx, id), "CREDITS_ALREADY_SPENT");
    // The XP reversal inside the failed transaction must have rolled back too.
    expect(totalXp(ctx)).toBe(100);
    expect(instanceFor(q.id).status).toBe("completed");
  });
});

describe("credit safety", () => {
  it("never lets the credit balance go negative and rolls back the failed transaction", () => {
    expectAppError(
      () => ctx.store.tx(() => recordCredits(ctx, { amount: -1, sourceType: "redemption", sourceId: null, idempotencyKey: "x" })),
      "INSUFFICIENT_CREDITS",
    );
    expect(creditBalance(ctx)).toBe(0);
    expect(ctx.store.db.select().from(creditTransactions).all()).toHaveLength(0);
  });

  it("rejects a duplicate idempotency key at the database level", () => {
    ctx.store.tx(() => recordCredits(ctx, { amount: 5, sourceType: "adjustment", sourceId: null, idempotencyKey: "k" }));
    expect(() => ctx.store.tx(() => recordCredits(ctx, { amount: 5, sourceType: "adjustment", sourceId: null, idempotencyKey: "k" }))).toThrow();
    expect(creditBalance(ctx)).toBe(5);
  });
});

describe("quest editing and lifecycle", () => {
  it("edits never change or duplicate historical payouts", () => {
    const q = dailyQuest();
    const id = instanceFor(q.id).instanceId;
    completeInstance(ctx, id);
    updateQuest(ctx, q.id, { xpReward: 999, creditReward: 99, title: "Train hard" });
    completeInstance(ctx, id);
    expect(totalXp(ctx)).toBe(100);
    expect(instanceFor(q.id).completion?.xpAwarded).toBe(100);

    ctx.clock.advanceHours(24);
    completeInstance(ctx, instanceFor(q.id, "2026-10-23").instanceId);
    expect(totalXp(ctx)).toBe(1099);
  });

  it("locks the frequency once a quest has history", () => {
    const q = dailyQuest();
    instanceFor(q.id);
    expectAppError(() => updateQuest(ctx, q.id, { frequency: "weekly" }), "FREQUENCY_LOCKED");
  });

  it("skips without payout and can be restored", () => {
    const q = dailyQuest();
    const id = instanceFor(q.id).instanceId;
    expect(setInstanceSkipped(ctx, id, true).status).toBe("skipped");
    expect(totalXp(ctx)).toBe(0);
    expect(setInstanceSkipped(ctx, id, false).status).toBe("pending");
  });

  it("reschedules one-time quests and hides them until they are due", () => {
    const q = createQuest(ctx, { title: "Dentist", difficulty: "easy", frequency: "once" });
    expect(instanceFor(q.id)).toBeTruthy();
    rescheduleQuest(ctx, q.id, "2026-10-30");
    expect(listInstancesForDate(ctx, TODAY).some((i) => i.quest.id === q.id)).toBe(false);
    expect(listUpcoming(ctx, TODAY).map((i) => i.quest.id)).toContain(q.id);
    expect(listInstancesForDate(ctx, "2026-10-30").some((i) => i.quest.id === q.id)).toBe(true);
    const daily = dailyQuest();
    expectAppError(() => rescheduleQuest(ctx, daily.id, "2026-10-30"), "RESCHEDULE_ONE_TIME_ONLY");
  });

  it("archived quests leave the board but keep their earned XP", () => {
    const q = dailyQuest();
    completeInstance(ctx, instanceFor(q.id).instanceId);
    setQuestArchived(ctx, q.id, true);
    ctx.clock.advanceHours(24);
    expect(listInstancesForDate(ctx, "2026-10-23").some((i) => i.quest.id === q.id)).toBe(false);
    expect(totalXp(ctx)).toBe(100);
  });
});
