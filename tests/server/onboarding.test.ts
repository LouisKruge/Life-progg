import { describe, expect, it } from "vitest";
import { makeCtx } from "../helpers.js";
import { completeOnboarding, removeDemoData } from "../../src/server/services/onboarding.js";
import { getSettings, listCategories } from "../../src/server/services/settings.js";
import { activeSavingsGoal, recordSavingsEntry } from "../../src/server/services/savings.js";
import { getDashboard } from "../../src/server/services/dashboard.js";
import { completeInstance, listQuests } from "../../src/server/services/quests.js";
import { totalXp } from "../../src/server/services/progression.js";
import { AppError } from "../../src/server/errors.js";

describe("onboarding", () => {
  it("works with every step skipped", () => {
    const ctx = makeCtx();
    const s = completeOnboarding(ctx, {});
    expect(s.onboarded).toBe(true);
    expect(s.currency).toBe("ZAR");
    expect(s.timezone).toBe("Africa/Johannesburg");
    expect(activeSavingsGoal(ctx)).toBeNull();
    expect(listQuests(ctx)).toHaveLength(0);
    const d = getDashboard(ctx);
    expect(d.quests).toHaveLength(0);
    expect(d.focus.headline).toMatch(/empty/i);
  });

  it("stores profile, focus categories, finances and the API key server-side", () => {
    const ctx = makeCtx();
    const s = completeOnboarding(ctx, {
      displayName: "Louis",
      mainGoals: ["Save R100k"],
      focusCategories: ["wealth", "physique"],
      monthlyRewardAllowanceCents: 100_000,
      finances: { monthlyIncomeCents: 2_500_000, startingSavingsCents: 600_000, monthlySavingsTargetCents: 500_000, firstMilestoneCents: 2_000_000, longTermMilestoneCents: 10_000_000 },
      anthropicApiKey: "sk-ant-test-key-abc",
    });
    expect(s).toMatchObject({ displayName: "Louis", mainGoals: ["Save R100k"], hasApiKey: true, aiEnabled: true, monthlyIncomeCents: 2_500_000 });
    expect(JSON.stringify(s)).not.toContain("sk-ant");
    expect(listCategories(ctx).filter((c) => c.isFocus).map((c) => c.key)).toEqual(["wealth", "physique"]);

    const goal = activeSavingsGoal(ctx)!;
    expect(goal).toMatchObject({ name: "First milestone", savedCents: 600_000, targetCents: 2_000_000, projectedCompletion: "2027-01" });

    // Reaching the first milestone moves the dashboard on to the long-term one.
    recordSavingsEntry(ctx, goal.id, { amountCents: 1_400_000 });
    expect(activeSavingsGoal(ctx)?.name).toBe("Long-term milestone");
    expect(getDashboard(ctx).recentEvents.some((e) => e.type === "savings_milestone")).toBe(true);
  });

  it("cannot be run twice", () => {
    const ctx = makeCtx();
    completeOnboarding(ctx, {});
    expect(() => completeOnboarding(ctx, {})).toThrow(AppError);
  });

  it("loads clearly flagged demo data that can be removed without losing earned XP", () => {
    const ctx = makeCtx();
    completeOnboarding(ctx, { loadDemoData: true });
    expect(listQuests(ctx).every((q) => q.isDemo)).toBe(true);
    const d = getDashboard(ctx);
    expect(d.quests.length).toBeGreaterThan(0);
    expect(d.nextReward).not.toBeNull();
    completeInstance(ctx, d.quests[0]!.instanceId);

    const res = removeDemoData(ctx);
    expect(res.deletedRewards).toBe(8);
    expect(listQuests(ctx)).toHaveLength(0);
    expect(totalXp(ctx)).toBeGreaterThan(0);
  });

  it("refuses withdrawals larger than the recorded savings", () => {
    const ctx = makeCtx();
    completeOnboarding(ctx, { finances: { startingSavingsCents: 1000, firstMilestoneCents: 5000 } });
    const goal = activeSavingsGoal(ctx)!;
    expect(() => recordSavingsEntry(ctx, goal.id, { amountCents: -2000 })).toThrow(AppError);
    expect(activeSavingsGoal(ctx)?.savedCents).toBe(1000);
    expect(getSettings(ctx).onboarded).toBe(true);
  });
});
