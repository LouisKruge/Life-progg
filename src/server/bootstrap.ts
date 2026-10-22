import type { AppContext } from "./context.js";
import { evaluateAchievements, seedAchievements } from "./services/achievements.js";
import { registerPreMigrationBackup } from "./services/backup.js";
import { registerProgressHook } from "./services/hooks.js";
import { computeMetrics } from "./services/metrics.js";
import { evaluateSkills, seedSkills } from "./services/skills.js";

/** Achievements and skills are re-evaluated inside every progress-changing transaction. */
function evaluateUnlocks(ctx: AppContext): void {
  const metrics = computeMetrics(ctx);
  evaluateAchievements(ctx, metrics);
  evaluateSkills(ctx, metrics);
}

/**
 * One-time setup after the database is open: seeds built-in definitions, wires hooks and
 * catches up on unlocks earned before this version existed. Safe to call repeatedly.
 */
export function bootstrap(ctx: AppContext): void {
  registerProgressHook(evaluateUnlocks);
  registerPreMigrationBackup(ctx);
  ctx.store.tx(() => {
    seedAchievements(ctx);
    seedSkills(ctx);
    evaluateUnlocks(ctx);
  });
}
