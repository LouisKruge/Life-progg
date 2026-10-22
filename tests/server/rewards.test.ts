import { beforeEach, describe, expect, it } from "vitest";
import { makeCtx } from "../helpers.js";
import { AppError } from "../../src/server/errors.js";
import { recordCredits, creditBalance } from "../../src/server/services/progression.js";
import { updateSettings } from "../../src/server/services/settings.js";
import {
  cancelRedemption,
  confirmRedemptionSpending,
  createReward,
  deleteReward,
  getRewardBudget,
  getVault,
  redeemReward,
  reorderRewards,
  syncCurrentAllowance,
} from "../../src/server/services/rewards.js";
import { createAccountWithBalance, listAccounts } from "../../src/server/services/wealth.js";
import { completeOnboarding, removeDemoData } from "../../src/server/services/onboarding.js";

let ctx: ReturnType<typeof makeCtx>;
let n = 0;
const req = () => `request-${++n}-abcdef`;

function grant(amount: number) {
  ctx.store.tx(() => recordCredits(ctx, { amount, sourceType: "adjustment", sourceId: null, idempotencyKey: `grant-${++n}` }));
}

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
  throw new Error("expected an AppError");
}

beforeEach(() => {
  ctx = makeCtx();
});

describe("reward redemption", () => {
  it("spends credits for a free reward without touching any allowance", () => {
    grant(100);
    const r = createReward(ctx, { name: "Gaming evening", creditPrice: 40 });
    const res = redeemReward(ctx, r.id, { requestId: req() });
    expect(res.credits).toBe(60);
    expect(res.redemption.status).toBe("reserved");
    expect(res.budget.reservedCents).toBe(0);
  });

  it("requires enough credits", () => {
    grant(10);
    const r = createReward(ctx, { name: "Cinema", creditPrice: 80 });
    expect(code(() => redeemReward(ctx, r.id, { requestId: req() }))).toBe("INSUFFICIENT_CREDITS");
    expect(creditBalance(ctx)).toBe(10);
  });

  it("is idempotent per request id", () => {
    grant(100);
    const r = createReward(ctx, { name: "Coffee", creditPrice: 30 });
    const id = req();
    const a = redeemReward(ctx, r.id, { requestId: id });
    const b = redeemReward(ctx, r.id, { requestId: id });
    expect(b.duplicate).toBe(true);
    expect(b.redemption.id).toBe(a.redemption.id);
    expect(creditBalance(ctx)).toBe(70);
  });

  it("requires a configured allowance for paid rewards", () => {
    grant(500);
    const r = createReward(ctx, { name: "Takeaway", creditPrice: 60, estimatedCostCents: 25_000 });
    expect(code(() => redeemReward(ctx, r.id, { requestId: req() }))).toBe("NO_ALLOWANCE");
  });

  it("reserves allowance and refuses when the month's allowance is used up", () => {
    grant(1000);
    updateSettings(ctx, { monthlyRewardAllowanceCents: 50_000 });
    const r = createReward(ctx, { name: "Restaurant date", creditPrice: 100, estimatedCostCents: 30_000 });
    redeemReward(ctx, r.id, { requestId: req() });
    expect(getRewardBudget(ctx)).toMatchObject({ allowanceCents: 50_000, reservedCents: 30_000, availableCents: 20_000 });
    expect(code(() => redeemReward(ctx, r.id, { requestId: req() }))).toBe("INSUFFICIENT_ALLOWANCE");
    // The failed attempt must not have cost any credits.
    expect(creditBalance(ctx)).toBe(900);
  });

  it("cancelling refunds credits and releases the allowance", () => {
    grant(200);
    updateSettings(ctx, { monthlyRewardAllowanceCents: 50_000 });
    const r = createReward(ctx, { name: "Golf", creditPrice: 150, estimatedCostCents: 40_000, quantityAvailable: 1 });
    const res = redeemReward(ctx, r.id, { requestId: req() });
    expect(code(() => redeemReward(ctx, r.id, { requestId: req() }))).toBe("OUT_OF_STOCK");
    const c = cancelRedemption(ctx, res.redemption.id);
    expect(c.credits).toBe(200);
    expect(c.budget.availableCents).toBe(50_000);
    expect(getVault(ctx).rewards[0]?.quantityAvailable).toBe(1);
    expect(code(() => cancelRedemption(ctx, res.redemption.id))).toBe("ALREADY_CANCELLED");
  });

  it("confirming spending records actual cost and blocks later refunds", () => {
    grant(200);
    updateSettings(ctx, { monthlyRewardAllowanceCents: 50_000 });
    const acc = createAccountWithBalance(ctx, { name: "Cheque", type: "cheque", openingBalanceCents: 100_000 });
    const r = createReward(ctx, { name: "Car detailing", creditPrice: 100, estimatedCostCents: 30_000 });
    const res = redeemReward(ctx, r.id, { requestId: req() });
    const done = confirmRedemptionSpending(ctx, res.redemption.id, { actualCostCents: 35_000, accountId: acc.id });
    expect(done.redemption).toMatchObject({ status: "fulfilled", actualCostCents: 35_000 });
    expect(done.budget).toMatchObject({ spentCents: 35_000, reservedCents: 0, availableCents: 15_000 });
    expect(listAccounts(ctx).find((a) => a.id === acc.id)?.balanceCents).toBe(65_000);
    expect(code(() => cancelRedemption(ctx, res.redemption.id))).toBe("ALREADY_FULFILLED");
  });

  it("never lets reward spending come out of protected savings", () => {
    grant(200);
    updateSettings(ctx, { monthlyRewardAllowanceCents: 50_000 });
    const savings = createAccountWithBalance(ctx, { name: "Savings", type: "savings", openingBalanceCents: 600_000 });
    const r = createReward(ctx, { name: "Cinema", creditPrice: 50, estimatedCostCents: 20_000 });
    const res = redeemReward(ctx, r.id, { requestId: req() });
    expect(code(() => confirmRedemptionSpending(ctx, res.redemption.id, { accountId: savings.id }))).toBe("PROTECTED_ACCOUNT");
    expect(listAccounts(ctx).find((a) => a.id === savings.id)?.balanceCents).toBe(600_000);
    expect(getVault(ctx).redemptions[0]?.status).toBe("reserved");
  });

  it("one-time rewards can only be redeemed once (unless cancelled)", () => {
    grant(500);
    const r = createReward(ctx, { name: "Weekend adventure", creditPrice: 100, repeatable: false });
    const first = redeemReward(ctx, r.id, { requestId: req() });
    expect(code(() => redeemReward(ctx, r.id, { requestId: req() }))).toBe("ALREADY_REDEEMED");
    cancelRedemption(ctx, first.redemption.id);
    expect(redeemReward(ctx, r.id, { requestId: req() }).duplicate).toBe(false);
  });

  it("keeps past months' allowance while syncing the current one", () => {
    updateSettings(ctx, { monthlyRewardAllowanceCents: 10_000 });
    expect(getRewardBudget(ctx).allowanceCents).toBe(10_000);
    updateSettings(ctx, { monthlyRewardAllowanceCents: 20_000 });
    syncCurrentAllowance(ctx);
    expect(getRewardBudget(ctx).allowanceCents).toBe(20_000);
    expect(getRewardBudget(ctx, "2026-09").allowanceCents).toBe(20_000); // created lazily from the setting
  });
});

describe("reward management", () => {
  it("archives instead of deleting rewards with history, and reorders", () => {
    grant(100);
    const a = createReward(ctx, { name: "A", creditPrice: 10 });
    const b = createReward(ctx, { name: "B", creditPrice: 10 });
    redeemReward(ctx, a.id, { requestId: req() });
    expect(deleteReward(ctx, a.id)).toEqual({ deleted: false, archived: true });
    expect(deleteReward(ctx, b.id)).toEqual({ deleted: true, archived: false });
    const c = createReward(ctx, { name: "C", creditPrice: 10 });
    const d = createReward(ctx, { name: "D", creditPrice: 10 });
    reorderRewards(ctx, [d.id, c.id]);
    expect(getVault(ctx).rewards.map((r) => r.name)).toEqual(["D", "C"]);
  });

  it("explains why a reward can't be redeemed", () => {
    createReward(ctx, { name: "Paid", creditPrice: 5, estimatedCostCents: 1000 });
    createReward(ctx, { name: "Pricey", creditPrice: 50 });
    grant(10);
    const v = getVault(ctx).rewards;
    expect(v.find((r) => r.name === "Paid")?.blockedReason).toMatch(/allowance/);
    expect(v.find((r) => r.name === "Pricey")?.blockedReason).toBe("40 more credits needed");
  });

  it("removing demo data archives redeemed demo rewards instead of breaking history", () => {
    completeOnboarding(ctx, { loadDemoData: true });
    grant(100);
    const gaming = getVault(ctx).rewards.find((r) => r.name === "Gaming evening")!;
    redeemReward(ctx, gaming.id, { requestId: req() });
    const res = removeDemoData(ctx);
    expect(res).toMatchObject({ archivedRewards: 1, deletedRewards: 7 });
    expect(getVault(ctx).redemptions).toHaveLength(1);
  });
});
