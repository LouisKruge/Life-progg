import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import * as v from "../validation.js";
import { cancelRedemption, confirmRedemptionSpending, createReward, deleteReward, getRewardBudget, getVault, listRewards, redeemReward, reorderRewards, updateReward } from "../services/rewards.js";
import { idOf, parse } from "./util.js";

export function rewardRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/rewards", async () => listRewards(ctx));
  app.get("/api/vault", async (req) => getVault(ctx, { includeArchived: (req.query as { includeArchived?: string }).includeArchived === "true" }));
  app.get("/api/vault/budget", async (req) => {
    const month = (req.query as { month?: string }).month;
    return getRewardBudget(ctx, month ? parse(v.monthString, month) : undefined);
  });
  app.post("/api/rewards", async (req, reply) => reply.code(201).send(createReward(ctx, parse(v.rewardSchema, req.body))));
  app.patch("/api/rewards/:id", async (req) => updateReward(ctx, idOf(req), parse(v.rewardPatchSchema, req.body)));
  app.delete("/api/rewards/:id", async (req) => deleteReward(ctx, idOf(req)));
  app.post("/api/rewards/reorder", async (req) => reorderRewards(ctx, parse(v.reorderSchema, req.body).ids));
  app.post("/api/rewards/:id/redeem", async (req) => redeemReward(ctx, idOf(req), parse(v.redeemSchema, req.body)));
  app.post("/api/redemptions/:id/cancel", async (req) => cancelRedemption(ctx, idOf(req)));
  app.post("/api/redemptions/:id/confirm", async (req) => confirmRedemptionSpending(ctx, idOf(req), parse(v.confirmSpendingSchema, req.body ?? {})));
}
