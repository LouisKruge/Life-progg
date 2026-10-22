import { asc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { rewards } from "../db/schema.js";

/** Active rewards in display order. Redemption (with budget safeguards) is implemented in phase 3. */
export function listRewards(ctx: AppContext) {
  return ctx.store.db
    .select({
      id: rewards.id,
      name: rewards.name,
      description: rewards.description,
      category: rewards.category,
      creditPrice: rewards.creditPrice,
      estimatedCostCents: rewards.estimatedCostCents,
      isDemo: rewards.isDemo,
    })
    .from(rewards)
    .where(eq(rewards.status, "active"))
    .orderBy(asc(rewards.sortOrder), asc(rewards.creditPrice))
    .all();
}
