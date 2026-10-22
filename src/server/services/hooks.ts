import type { AppContext } from "../context.js";

type Hook = (ctx: AppContext) => void;
const hooks: Hook[] = [];

/**
 * Hooks run inside the transaction of any progress-changing mutation (quest completion,
 * savings entry, debt payment, redemption). Achievements and skill unlocks register here,
 * which keeps those modules decoupled from the services that trigger them.
 */
export function registerProgressHook(hook: Hook): void {
  if (!hooks.includes(hook)) hooks.push(hook);
}

export function runProgressHooks(ctx: AppContext): void {
  for (const h of hooks) h(ctx);
}
