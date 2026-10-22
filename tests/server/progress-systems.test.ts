import { beforeEach, describe, expect, it } from "vitest";
import { makeCtx } from "../helpers.js";
import { AppError } from "../../src/server/errors.js";
import { completeInstance, createQuest, listInstancesForDate, undoInstance } from "../../src/server/services/quests.js";
import { creditBalance, getCharacter, totalXp } from "../../src/server/services/progression.js";
import { createCustomAchievement, deleteCustomAchievement, listAchievements, markUnlocksSeen, unlockManually, unseenUnlocks } from "../../src/server/services/achievements.js";
import { listSkillTrees } from "../../src/server/services/skills.js";
import { computeMetrics, streaks, takeSnapshot } from "../../src/server/services/metrics.js";
import {
  activateSeason,
  addSeasonGoal,
  completeSeason,
  createSeason,
  getSeason,
  saveWeeklyReview,
  setSeasonArchived,
  updateSeasonGoal,
} from "../../src/server/services/seasons.js";
import { addNote, deleteNote, queryTimeline } from "../../src/server/services/timeline.js";
import { setupSavingsGoal, recordSavingsEntry } from "../../src/server/services/savings.js";
import { createDebt, recordDebtPayment } from "../../src/server/services/wealth.js";
import { listCategories } from "../../src/server/services/settings.js";

let ctx: ReturnType<typeof makeCtx>;
beforeEach(() => {
  ctx = makeCtx();
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
  throw new Error("expected error");
};
const cat = (key: string) => listCategories(ctx).find((c) => c.key === key)!.id;
const unlocked = (key: string) => listAchievements(ctx).find((a) => a.key === key)?.unlockedAt != null;

/** Completes a fresh one-time quest today. */
function completeOne(opts: { categoryKey?: string; xp?: number } = {}) {
  const q = createQuest(ctx, { title: `Q${Math.random()}`, difficulty: "easy", frequency: "once", xpReward: opts.xp ?? 50, categoryId: opts.categoryKey ? cat(opts.categoryKey) : null });
  const inst = listInstancesForDate(ctx, "2026-10-22").find((i) => i.quest.id === q.id)!;
  return completeInstance(ctx, inst.instanceId);
}

describe("streaks", () => {
  it("finds the longest run and the current run (which may end yesterday)", () => {
    expect(streaks(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"], "2026-10-12")).toEqual({ longest: 3, current: 2 });
    expect(streaks(["2026-10-12"], "2026-10-12")).toEqual({ longest: 1, current: 1 });
    expect(streaks([], "2026-10-12")).toEqual({ longest: 0, current: 0 });
  });

  it("counts consecutive days of completions across a month", () => {
    const q = createQuest(ctx, { title: "Daily", difficulty: "trivial", frequency: "daily" });
    for (let d = 0; d < 30; d++) {
      const date = new Date(Date.UTC(2026, 9, 22 + d, 8)).toISOString();
      ctx.clock.set(date);
      const inst = listInstancesForDate(ctx, date.slice(0, 10)).find((i) => i.quest.id === q.id)!;
      completeInstance(ctx, inst.instanceId);
    }
    expect(computeMetrics(ctx).longestStreak).toBe(30);
    expect(unlocked("streak_7")).toBe(true);
    expect(unlocked("streak_30")).toBe(true);
  });
});

describe("achievements", () => {
  it("unlocks from verifiable data, once, and stays unlocked after an undo", () => {
    expect(unlocked("first_quest")).toBe(false);
    const res = completeOne();
    expect(unlocked("first_quest")).toBe(true);
    const at = listAchievements(ctx).find((a) => a.key === "first_quest")!.unlockedAt;
    undoInstance(ctx, res.instance.instanceId);
    completeOne();
    expect(listAchievements(ctx).find((a) => a.key === "first_quest")!.unlockedAt).toBe(at);
    expect(queryTimeline(ctx, { types: ["achievement"] }).items.filter((i) => i.title.includes("First Step"))).toHaveLength(1);
  });

  it("unlocks savings and debt milestones from real balances", () => {
    const goal = setupSavingsGoal(ctx, { name: "Fund", targetCents: 2_000_000, startingBalanceCents: 1_500_000 });
    recordSavingsEntry(ctx, goal.id, { amountCents: 499_999 });
    expect(unlocked("savings_20k")).toBe(false);
    recordSavingsEntry(ctx, goal.id, { amountCents: 1 });
    expect(unlocked("savings_20k")).toBe(true);

    const d = createDebt(ctx, { name: "Card", startingBalanceCents: 10_000 });
    recordDebtPayment(ctx, d.id, { amountCents: 10_000 });
    expect(unlocked("first_debt_paid")).toBe(true);
    expect(unlocked("debt_free")).toBe(true);
  });

  it("reports progress toward locked achievements with explicit conditions", () => {
    completeOne({ categoryKey: "physique" });
    const a = listAchievements(ctx).find((x) => x.key === "fitness_10")!;
    expect(a.condition).toBe("Complete 10 Physique quests");
    expect(a.progress).toBeCloseTo(0.1);
    expect(listAchievements(ctx).find((x) => x.key === "savings_20k")!.condition).toMatch(/20[\s, ]000/);
  });

  it("only manual achievements can be unlocked by hand, with evidence", () => {
    const strength = listAchievements(ctx).find((a) => a.key === "strength_record")!;
    const res = unlockManually(ctx, strength.id, "Deadlift 140 kg");
    expect(res).toMatchObject({ evidence: "Deadlift 140 kg", progress: 1 });
    expect(code(() => unlockManually(ctx, strength.id, ""))).toBe("ALREADY_UNLOCKED");
    const auto = listAchievements(ctx).find((a) => a.key === "level_10")!;
    expect(code(() => unlockManually(ctx, auto.id, "trust me"))).toBe("AUTOMATIC_ACHIEVEMENT");
  });

  it("supports custom achievements that are permanent once unlocked", () => {
    const c = createCustomAchievement(ctx, { name: "Ran a marathon", description: "42.2 km", category: "fitness", tier: "gold" });
    expect(c.isCustom).toBe(true);
    unlockManually(ctx, c.id, "Cape Town Marathon");
    expect(code(() => deleteCustomAchievement(ctx, c.id))).toBe("ALREADY_UNLOCKED");
    const d = createCustomAchievement(ctx, { name: "Temp", description: "x", category: "personal", tier: "bronze" });
    deleteCustomAchievement(ctx, d.id);
    expect(listAchievements(ctx).some((a) => a.id === d.id)).toBe(false);
  });

  it("surfaces each unlock for celebration exactly once", () => {
    completeOne();
    expect(unseenUnlocks(ctx).map((u) => u.name)).toEqual(expect.arrayContaining(["First Step"]));
    markUnlocksSeen(ctx);
    expect(unseenUnlocks(ctx)).toHaveLength(0);
  });
});

describe("skill trees", () => {
  it("has six trees and only unlocks nodes whose parents are unlocked", () => {
    const trees = listSkillTrees(ctx);
    expect(trees.map((t) => t.key)).toEqual(["wealth", "physique", "mind", "empire", "life", "discipline"]);
    // Savings alone don't unlock "Saver": its parent "Tracker" needs a completed Wealth quest.
    setupSavingsGoal(ctx, { name: "Fund", targetCents: 1_000_000, startingBalanceCents: 600_000 });
    completeOne(); // triggers evaluation; no wealth quest yet
    const wealth = () => listSkillTrees(ctx).find((t) => t.key === "wealth")!.nodes;
    expect(wealth().find((n) => n.key === "wealth_saver")!.unlockedAt).toBeNull();
    expect(wealth().find((n) => n.key === "wealth_saver")!.available).toBe(false);
    // One wealth quest unlocks Tracker, and Saver cascades in the same evaluation.
    completeOne({ categoryKey: "wealth" });
    expect(wealth().find((n) => n.key === "wealth_tracker")!.unlockedAt).not.toBeNull();
    expect(wealth().find((n) => n.key === "wealth_saver")!.unlockedAt).not.toBeNull();
    expect(wealth().find((n) => n.key === "wealth_buffer")!.available).toBe(true);
  });

  it("tracks skill-specific XP per tree", () => {
    completeOne({ categoryKey: "mind", xp: 300 });
    expect(listSkillTrees(ctx).find((t) => t.key === "mind")!.xp).toBe(300);
  });
});

describe("seasons", () => {
  it("runs a full season lifecycle without touching lifetime progress", () => {
    completeOne({ xp: 200 }); // before the season
    const xpBefore = totalXp(ctx);
    const credits = creditBalance(ctx);
    const s = createSeason(ctx, {
      name: "Foundation",
      startDate: "2026-10-22",
      goals: [{ title: "Save R20k", isPrimary: true }, { title: "Train 3x a week", isPrimary: true }, { title: "Read 6 books", isPrimary: true }, { title: "Learn to cook" }],
      celebration: "Weekend away",
    });
    expect(s).toMatchObject({ endDate: "2027-01-19", totalDays: 90, status: "planned" });
    expect(code(() => addSeasonGoal(ctx, s.id, { title: "Fourth primary", isPrimary: true }))).toBe("TOO_MANY_PRIMARY");

    activateSeason(ctx, s.id);
    const other = createSeason(ctx, { name: "Next", startDate: "2027-01-20" });
    expect(code(() => activateSeason(ctx, other.id))).toBe("SEASON_ACTIVE");

    ctx.clock.advanceHours(1);
    completeOne({ xp: 120 });
    const goal = getSeason(ctx, s.id).goals.find((g) => g.title === "Save R20k")!;
    updateSeasonGoal(ctx, goal.id, { status: "achieved" });
    const cook = getSeason(ctx, s.id).goals.find((g) => g.title === "Learn to cook")!;
    updateSeasonGoal(ctx, cook.id, { status: "dropped" }); // life changed; kept for the record
    saveWeeklyReview(ctx, s.id, { wins: "Consistent", rating: 4 });
    saveWeeklyReview(ctx, s.id, { wins: "Edited", rating: 5 }); // same week: updated, not duplicated

    const view = getSeason(ctx, s.id);
    expect(view.reviews).toHaveLength(1);
    expect(view.reviews[0]).toMatchObject({ wins: "Edited", rating: 5, weekStart: "2026-10-19" });
    expect(view.weeklyXp[0]).toEqual({ weekStart: "2026-10-19", xp: 320 });

    const done = completeSeason(ctx, s.id);
    expect(done.status).toBe("completed");
    expect(done.summary).toMatchObject({ goalsAchieved: 1, goalsTotal: 3, reviewsWritten: 1 });
    expect(unlocked("first_season")).toBe(true);
    // Lifetime numbers are intact.
    expect(totalXp(ctx)).toBe(xpBefore + 120);
    expect(creditBalance(ctx)).toBe(credits + 5);
    expect(getCharacter(ctx).stats.questsCompleted).toBe(2);
    // Completed seasons are read-only records, but can be archived and restored.
    expect(code(() => updateSeasonGoal(ctx, goal.id, { title: "x" }))).toBe("SEASON_CLOSED");
    expect(setSeasonArchived(ctx, s.id, true).status).toBe("archived");
    expect(setSeasonArchived(ctx, s.id, false).status).toBe("completed");
    expect(queryTimeline(ctx, { types: ["season_completed"] }).items[0]?.detail).toContain("Weekend away");
  });
});

describe("timeline", () => {
  it("filters by type and date, and only lets notes be deleted", () => {
    completeOne();
    const note = addNote(ctx, { title: "Moved into the new flat", kind: "event" });
    takeSnapshot(ctx);
    const page = queryTimeline(ctx, {});
    expect(page.types).toEqual(expect.arrayContaining(["quest_completed", "life_event", "snapshot", "achievement"]));
    expect(queryTimeline(ctx, { types: ["snapshot"] }).items[0]?.data).toMatchObject({ level: 1, questsCompleted: 1 });
    expect(queryTimeline(ctx, { from: "2030-01-01T00:00:00Z" }).total).toBe(0);
    const system = queryTimeline(ctx, { types: ["quest_completed"] }).items[0]!;
    expect(code(() => deleteNote(ctx, system.id))).toBe("SYSTEM_EVENT");
    deleteNote(ctx, note.id);
    expect(queryTimeline(ctx, { types: ["life_event"] }).total).toBe(0);
  });
});
