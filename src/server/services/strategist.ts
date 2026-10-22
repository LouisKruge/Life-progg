import Anthropic from "@anthropic-ai/sdk";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { aiConversations, aiMessages, aiProposals } from "../db/schema.js";
import type { AiConversationView, AiDataScope, AiProposalView, AiStatus } from "../../shared/types.js";
import { AppError, conflict, notFound } from "../errors.js";
import { isValidDate, weekday } from "../domain/dates.js";
import { getSettings, getApiKey, listCategories, today } from "./settings.js";
import { getCharacter } from "./progression.js";
import { completeInstance, createQuest, listInstancesForDate, listQuests, listUpcoming } from "./quests.js";
import { getWealthOverview } from "./wealth.js";
import { getVault } from "./rewards.js";
import { activeSeason, addSeasonGoal } from "./seasons.js";
import { addNote, queryTimeline } from "./timeline.js";
import { computeMetrics } from "./metrics.js";

// Safety model:
// - The model only ever sees data from categories the user enabled in the privacy panel.
// - Read tools return database facts, labelled as verified.
// - The model cannot change anything. "propose_*" tools only store a pending proposal; the
//   user approves it in the UI and the normal validated service performs the change.
// - Model output is never executed as SQL or code; every tool input is schema-validated.

const MAX_TOOL_ROUNDS = 8;

/** The subset of the SDK the strategist uses, so tests can inject a scripted fake. */
export interface MessagesClient {
  create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage>;
}

let clientFactory: (apiKey: string) => MessagesClient = (apiKey) => {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  return { create: (params) => client.beta.messages.create(params) };
};

/** Test hook: replace how the API client is created. */
export function setMessagesClientFactory(factory: (apiKey: string) => MessagesClient): void {
  clientFactory = factory;
}

const SYSTEM_PROMPT = `You are the Strategist inside LEVEL ONE, a personal life operating system for one person in South Africa. You help them plan days and weeks, break goals into quests, understand their progress and finances, and reflect.

How you work:
- Use the read tools to look at their actual data before giving advice that depends on it. You only have the data categories they have allowed; if a tool is missing, say that the category is not shared rather than guessing.
- Clearly separate three kinds of statements: VERIFIED facts from the tools ("your savings balance is R6,000"), ESTIMATES or projections you calculate ("at R5,000 a month that's about 3 months"), and SUGGESTIONS. Never present an estimate or suggestion as a fact.
- Never say a quest, payment or reward happened unless a tool shows it. You cannot change any data. To suggest a change, call a propose_* tool: it only creates a proposal the user can approve or reject in the app. Tell them it is waiting for their approval.
- Money is in South African rand (ZAR). Never suggest borrowing to pay for rewards, moving savings or debt-repayment money into spending, or anything resembling gambling.
- Rest, food, relationships and basic wellbeing are never things that must be earned. Encourage sustainable progress over intensity; respect rest days and workload limits.
- Tone: clear, calm, practical, encouraging without being patronising, never judgemental. Be concise; use short lists when they help.`;

// ---------- Tools ----------

type ToolDef = { scope: AiDataScope; tool: Anthropic.Beta.BetaTool; run: (ctx: AppContext, input: unknown, conversationId: number) => unknown };

const empty = { type: "object" as const, properties: {}, additionalProperties: false };

const proposeQuestInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  difficulty: z.enum(["trivial", "easy", "medium", "hard", "epic"]),
  frequency: z.enum(["once", "daily", "weekly"]),
  categoryKey: z.enum(["wealth", "physique", "mind", "empire", "life", "discipline"]).optional(),
  dueDate: z.string().refine(isValidDate).optional(),
  reason: z.string().trim().max(500),
});
const proposeCompleteInput = z.object({ instanceId: z.number().int().positive(), reason: z.string().trim().max(500) });
const proposeNoteInput = z.object({ title: z.string().trim().min(1).max(160), detail: z.string().trim().max(2000).optional() });
const proposeGoalInput = z.object({ title: z.string().trim().min(1).max(160), isPrimary: z.boolean().optional(), reason: z.string().trim().max(500) });

function storeProposal(ctx: AppContext, conversationId: number, kind: AiProposalView["kind"], payload: Record<string, unknown>, summary: string) {
  const row = ctx.store.db.insert(aiProposals).values({ conversationId, kind, payload, summary }).returning().get();
  return { proposalId: row.id, status: "pending_user_approval", note: "Nothing has changed yet. The user will approve or reject this in the app." };
}

const TOOLS: ToolDef[] = [
  {
    scope: "quests",
    tool: { name: "get_today_quests", description: "Today's quest board (verified): each quest instance with status pending/completed/skipped, rewards, difficulty and instanceId, plus upcoming one-time quests.", input_schema: empty },
    run: (ctx) => {
      const d = today(ctx);
      const view = (i: ReturnType<typeof listInstancesForDate>[number]) => ({ instanceId: i.instanceId, title: i.quest.title, status: i.status, difficulty: i.quest.difficulty, frequency: i.quest.frequency, xp: i.quest.xpReward, credits: i.quest.creditReward, optional: i.quest.isOptional, dueDate: i.quest.dueDate });
      return { date: d, isRestDay: getSettings(ctx).restDays.includes(weekday(d)), today: listInstancesForDate(ctx, d).map(view), upcoming: listUpcoming(ctx, d).map(view) };
    },
  },
  {
    scope: "quests",
    tool: { name: "list_quests", description: "All active quest definitions (verified), with schedule and rewards.", input_schema: empty },
    run: (ctx) => listQuests(ctx).map((q) => ({ id: q.id, title: q.title, frequency: q.frequency, difficulty: q.difficulty, xp: q.xpReward, credits: q.creditReward, optional: q.isOptional })),
  },
  {
    scope: "progression",
    tool: { name: "get_character", description: "Level, rank, lifetime XP, credit balance, per-category XP, streaks and totals (verified).", input_schema: empty },
    run: (ctx) => {
      const c = getCharacter(ctx);
      const m = computeMetrics(ctx);
      return { level: c.level.level, rank: c.rank, totalXp: c.level.totalXp, xpToNextLevel: c.level.xpForNextLevel - c.level.xpIntoLevel, credits: c.credits, categories: c.categories.map((x) => ({ name: x.name, xp: x.xp, focus: x.isFocus })), questsCompleted: m.questsCompleted, activeDays: m.activeDays, currentStreak: m.currentStreak, longestStreak: m.longestStreak, mainGoals: getSettings(ctx).mainGoals };
    },
  },
  {
    scope: "finances",
    tool: { name: "get_finances", description: "Accounts with confirmed balances, this month's income/expenses and budget lines, savings goals, debts with payoff estimates, emergency fund. Amounts are in ZAR cents. Balances are verified; 'pending', 'projection' and 'payoff' values are estimates.", input_schema: empty },
    run: (ctx) => {
      const w = getWealthOverview(ctx);
      return { ...w, note: "All *Cents values are integer cents. projection/payoff are estimates, not facts." };
    },
  },
  {
    scope: "rewards",
    tool: { name: "get_rewards", description: "Reward vault (verified): credit balance, this month's reward allowance and use, rewards with prices and whether each can be redeemed now.", input_schema: empty },
    run: (ctx) => {
      const v = getVault(ctx);
      return { credits: v.credits, allowance: v.budget, rewards: v.rewards.map((r) => ({ name: r.name, credits: r.creditPrice, estimatedCostCents: r.estimatedCostCents, blockedReason: r.blockedReason })), recentRedemptions: v.redemptions.slice(0, 10) };
    },
  },
  {
    scope: "seasons",
    tool: { name: "get_active_season", description: "The active ninety-day season (verified): objectives with status, day number, season XP and recent weekly reviews.", input_schema: empty },
    run: (ctx) => activeSeason(ctx) ?? { active: false },
  },
  {
    scope: "journal",
    tool: { name: "get_recent_timeline", description: "The 40 most recent timeline events (verified): completions, milestones, the user's own notes and life events.", input_schema: empty },
    run: (ctx) => queryTimeline(ctx, { limit: 40 }).items.map((e) => ({ type: e.type, title: e.title, detail: e.detail, at: e.occurredAt })),
  },
  {
    scope: "quests",
    tool: {
      name: "propose_quest",
      description: "Propose a new quest. This does NOT create it: it stores a proposal the user can approve or reject. Use when a concrete, small, repeatable or one-off action would help.",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          difficulty: { type: "string", enum: ["trivial", "easy", "medium", "hard", "epic"] },
          frequency: { type: "string", enum: ["once", "daily", "weekly"] },
          categoryKey: { type: "string", enum: ["wealth", "physique", "mind", "empire", "life", "discipline"] },
          dueDate: { type: "string", description: "YYYY-MM-DD, only for frequency 'once'" },
          reason: { type: "string", description: "Why this helps, shown to the user" },
        },
        required: ["title", "difficulty", "frequency", "reason"],
        additionalProperties: false,
      },
    },
    run: (ctx, input, conversationId) => {
      const p = proposeQuestInput.parse(input);
      return storeProposal(ctx, conversationId, "create_quest", p, `New ${p.frequency === "once" ? "one-time" : p.frequency} quest: “${p.title}” (${p.difficulty}). ${p.reason}`);
    },
  },
  {
    scope: "quests",
    tool: {
      name: "propose_quest_completion",
      description: "Propose marking a quest instance as completed, ONLY when the user has told you in this conversation that they did it. Does NOT complete it: the user must confirm in the app.",
      input_schema: { type: "object", properties: { instanceId: { type: "integer" }, reason: { type: "string" } }, required: ["instanceId", "reason"], additionalProperties: false },
    },
    run: (ctx, input, conversationId) => {
      const p = proposeCompleteInput.parse(input);
      const inst = listInstancesForDate(ctx, today(ctx)).find((i) => i.instanceId === p.instanceId);
      if (!inst) return { error: "No quest instance with that id is on today's board." };
      if (inst.status !== "pending") return { error: `That quest is already ${inst.status}.` };
      return storeProposal(ctx, conversationId, "complete_quest", p, `Mark “${inst.quest.title}” as done (+${inst.quest.xpReward} XP, +${inst.quest.creditReward} credits). ${p.reason}`);
    },
  },
  {
    scope: "journal",
    tool: {
      name: "propose_note",
      description: "Propose saving a reflection or note to the user's timeline. Does NOT save it until the user approves.",
      input_schema: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title"], additionalProperties: false },
    },
    run: (ctx, input, conversationId) => {
      const p = proposeNoteInput.parse(input);
      return storeProposal(ctx, conversationId, "add_note", p, `Save a note: “${p.title}”`);
    },
  },
  {
    scope: "seasons",
    tool: {
      name: "propose_season_goal",
      description: "Propose adding an objective to the active season. Does NOT add it until the user approves.",
      input_schema: { type: "object", properties: { title: { type: "string" }, isPrimary: { type: "boolean" }, reason: { type: "string" } }, required: ["title", "reason"], additionalProperties: false },
    },
    run: (ctx, input, conversationId) => {
      const p = proposeGoalInput.parse(input);
      if (!activeSeason(ctx)) return { error: "There is no active season." };
      return storeProposal(ctx, conversationId, "add_season_goal", p, `Add ${p.isPrimary ? "primary" : "secondary"} season objective: “${p.title}”. ${p.reason}`);
    },
  },
];

/** Tools exposed for the given privacy scopes. Exported for the privacy panel and tests. */
export function toolsForScopes(scopes: AiDataScope[]): ToolDef[] {
  return TOOLS.filter((t) => scopes.includes(t.scope));
}

export function aiStatus(ctx: AppContext): AiStatus & { tools: Array<{ name: string; scope: AiDataScope; writes: boolean }> } {
  const s = getSettings(ctx);
  return {
    enabled: s.aiEnabled && s.hasApiKey,
    hasApiKey: s.hasApiKey,
    model: s.aiModel,
    scopes: s.aiDataScopes,
    tools: toolsForScopes(s.aiDataScopes).map((t) => ({ name: t.tool.name, scope: t.scope, writes: t.tool.name.startsWith("propose_") })),
  };
}

// ---------- Conversations ----------

type StoredContent = Anthropic.Beta.BetaContentBlockParam[];

function toolNamesIn(content: unknown[]): string[] {
  return (content as Array<{ type: string; name?: string }>).filter((b) => b.type === "tool_use" && b.name).map((b) => b.name!);
}

export function getConversation(ctx: AppContext, id: number): AiConversationView {
  const c = ctx.store.db.select().from(aiConversations).where(eq(aiConversations.id, id)).get();
  if (!c) throw notFound("Conversation");
  const rows = ctx.store.db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(asc(aiMessages.id)).all();
  // Tool calls are attached to the next visible assistant answer so the user sees what data was read.
  const messages: AiConversationView["messages"] = [];
  let pendingTools: string[] = [];
  for (const r of rows) {
    if (r.role === "assistant") pendingTools.push(...toolNamesIn(r.content));
    if (!r.visible) continue;
    messages.push({ id: r.id, role: r.role, text: r.displayText, toolsUsed: r.role === "assistant" ? [...new Set(pendingTools)] : [], createdAt: r.createdAt });
    if (r.role === "assistant") pendingTools = [];
  }
  const proposals = ctx.store.db
    .select()
    .from(aiProposals)
    .where(eq(aiProposals.conversationId, id))
    .orderBy(asc(aiProposals.id))
    .all()
    .map((p) => ({ id: p.id, kind: p.kind, summary: p.summary, payload: p.payload, status: p.status, resultNote: p.resultNote }));
  return { id: c.id, title: c.title, mode: c.mode, messages, proposals, updatedAt: c.updatedAt };
}

export function listConversations(ctx: AppContext): Array<{ id: number; title: string; mode: string; updatedAt: string }> {
  return ctx.store.db.select().from(aiConversations).orderBy(desc(aiConversations.updatedAt)).limit(50).all().map((c) => ({ id: c.id, title: c.title, mode: c.mode, updatedAt: c.updatedAt }));
}

export function deleteConversation(ctx: AppContext, id: number): void {
  ctx.store.db.delete(aiConversations).where(eq(aiConversations.id, id)).run();
}

function appendMessage(ctx: AppContext, conversationId: number, role: "user" | "assistant", content: StoredContent | Anthropic.Beta.BetaContentBlock[], displayText: string, visible: boolean) {
  ctx.store.db.insert(aiMessages).values({ conversationId, role, content: content as unknown[], displayText, visible, createdAt: ctx.clock.now().toISOString() }).run();
  ctx.store.db.update(aiConversations).set({ updatedAt: ctx.clock.now().toISOString() }).where(eq(aiConversations.id, conversationId)).run();
}

function history(ctx: AppContext, conversationId: number): Anthropic.Beta.BetaMessageParam[] {
  return ctx.store.db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.id))
    .all()
    .map((m) => ({ role: m.role, content: m.content as StoredContent }));
}

function mapApiError(err: unknown): never {
  if (err instanceof AppError) throw err;
  if (err instanceof Anthropic.AuthenticationError) throw new AppError(400, "AI_KEY_REJECTED", "The Claude API key was rejected. Check it in Settings.");
  if (err instanceof Anthropic.PermissionDeniedError) throw new AppError(403, "AI_PERMISSION", "This API key can't use the selected model.");
  if (err instanceof Anthropic.RateLimitError) throw new AppError(429, "AI_RATE_LIMITED", "The AI service is busy or your usage limit was reached. Try again shortly.");
  if (err instanceof Anthropic.BadRequestError) throw new AppError(400, "AI_BAD_REQUEST", `The AI service rejected the request: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) throw new AppError(503, "AI_OFFLINE", "Couldn't reach the AI service. Planner mode still works offline.");
  if (err instanceof Anthropic.APIError) throw new AppError(502, "AI_ERROR", `The AI service returned an error (${err.status ?? "unknown"}).`);
  throw err;
}

/**
 * Sends a user message and runs the tool loop to completion. History is append-only so the
 * assistant's own blocks (thinking, tool_use) are always replayed unchanged.
 */
export async function sendMessage(ctx: AppContext, input: { conversationId?: number; text: string; mode?: "chat" | "daily_focus" | "weekly_review" }): Promise<AiConversationView> {
  const settings = getSettings(ctx);
  const apiKey = getApiKey(ctx);
  if (!apiKey) throw conflict("AI_NOT_CONFIGURED", "Add a Claude API key in Settings to use the AI strategist. Planner mode works without one.");
  if (!settings.aiEnabled) throw conflict("AI_DISABLED", "The AI strategist is turned off in Settings.");

  let conversationId = input.conversationId;
  if (conversationId) {
    if (!ctx.store.db.select().from(aiConversations).where(eq(aiConversations.id, conversationId)).get()) throw notFound("Conversation");
  } else {
    const title = input.mode === "daily_focus" ? `Daily focus · ${today(ctx)}` : input.mode === "weekly_review" ? `Weekly review · ${today(ctx)}` : input.text.slice(0, 60);
    conversationId = ctx.store.db.insert(aiConversations).values({ title, mode: input.mode ?? "chat", createdAt: ctx.clock.now().toISOString(), updatedAt: ctx.clock.now().toISOString() }).returning().get().id;
  }

  // Volatile context (the date) goes in the user turn, not the system prompt, so the prefix stays cacheable.
  const d = today(ctx);
  const userContent: StoredContent = [{ type: "text", text: `[Today is ${d}, ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(d)]}. User: ${settings.displayName}.]\n\n${input.text}` }];
  appendMessage(ctx, conversationId, "user", userContent, input.text, true);

  const scoped = toolsForScopes(settings.aiDataScopes);
  const client = clientFactory(apiKey);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.create({
        model: settings.aiModel,
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: scoped.map((t) => t.tool),
        messages: history(ctx, conversationId),
        output_config: { effort: "medium" },
        // Server-side fallback: a safety decline is re-run on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (err) {
      mapApiError(err);
    }

    if (response.stop_reason === "refusal") {
      appendMessage(ctx, conversationId, "assistant", [{ type: "text", text: "I can't help with that request." }], "I can't help with that one. Try rephrasing, or ask about your plans, progress or goals.", true);
      return getConversation(ctx, conversationId);
    }

    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    appendMessage(ctx, conversationId, "assistant", response.content, text, toolUses.length === 0 || text.length > 0);

    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (response.stop_reason === "max_tokens" && !text) {
        appendMessage(ctx, conversationId, "user", [{ type: "text", text: "Please give a shorter answer." }], "", false);
        continue;
      }
      return getConversation(ctx, conversationId);
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((use) => {
      const def = scoped.find((t) => t.tool.name === use.name);
      if (!def) return { type: "tool_result", tool_use_id: use.id, is_error: true, content: "This data category is not shared with the strategist." };
      try {
        const out = ctx.store.tx(() => def.run(ctx, use.input, conversationId!));
        return { type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ source: "LEVEL ONE database", data: out }) };
      } catch (err) {
        const message = err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` : err instanceof AppError ? err.message : "Tool failed.";
        return { type: "tool_result", tool_use_id: use.id, is_error: true, content: message };
      }
    });
    appendMessage(ctx, conversationId, "user", results, "", false);
  }

  appendMessage(ctx, conversationId, "user", [{ type: "text", text: "(Tool limit reached.)" }], "", false);
  appendMessage(ctx, conversationId, "assistant", [{ type: "text", text: "I looked at a lot of data and stopped before finishing. Ask a narrower question and I'll continue." }], "I looked at a lot of data and stopped before finishing. Ask a narrower question and I'll continue.", true);
  return getConversation(ctx, conversationId);
}

// ---------- Proposals ----------

/**
 * Executes an approved proposal through the same validated services the UI uses. The proposal
 * is re-validated now, so stale or tampered payloads fail safely.
 */
export function decideProposal(ctx: AppContext, proposalId: number, approve: boolean): AiProposalView {
  const p = ctx.store.db.select().from(aiProposals).where(eq(aiProposals.id, proposalId)).get();
  if (!p) throw notFound("Proposal");
  if (p.status !== "pending") throw conflict("ALREADY_DECIDED", `This proposal was already ${p.status}.`);
  const decidedAt = ctx.clock.now().toISOString();
  if (!approve) {
    ctx.store.db.update(aiProposals).set({ status: "rejected", decidedAt }).where(eq(aiProposals.id, proposalId)).run();
  } else {
    let status: "approved" | "failed" = "approved";
    let resultNote = "";
    try {
      ctx.store.tx(() => {
        switch (p.kind) {
          case "create_quest": {
            const q = proposeQuestInput.parse(p.payload);
            const categoryId = q.categoryKey ? listCategories(ctx).find((c) => c.key === q.categoryKey)?.id ?? null : null;
            const created = createQuest(ctx, { title: q.title, description: q.description, difficulty: q.difficulty, frequency: q.frequency, categoryId, dueDate: q.frequency === "once" ? q.dueDate ?? null : null });
            resultNote = `Quest #${created.id} created.`;
            break;
          }
          case "complete_quest": {
            const c = proposeCompleteInput.parse(p.payload);
            const res = completeInstance(ctx, c.instanceId, { confirmed: true, evidenceNote: "Confirmed via the strategist" });
            resultNote = res.alreadyCompleted ? "It was already completed; nothing was paid twice." : `+${res.delta.xpGained} XP, +${res.delta.creditsGained} credits.`;
            break;
          }
          case "add_note": {
            const n = proposeNoteInput.parse(p.payload);
            addNote(ctx, { title: n.title, detail: n.detail });
            resultNote = "Saved to your timeline.";
            break;
          }
          case "add_season_goal": {
            const g = proposeGoalInput.parse(p.payload);
            const season = activeSeason(ctx);
            if (!season) throw conflict("NO_ACTIVE_SEASON", "There is no active season anymore.");
            addSeasonGoal(ctx, season.id, { title: g.title, isPrimary: g.isPrimary });
            resultNote = `Added to ${season.name}.`;
            break;
          }
        }
      });
    } catch (err) {
      status = "failed";
      resultNote = err instanceof AppError ? err.message : err instanceof z.ZodError ? "The proposal's details were invalid." : "It couldn't be applied.";
    }
    ctx.store.db.update(aiProposals).set({ status, resultNote, decidedAt }).where(eq(aiProposals.id, proposalId)).run();
  }
  const row = ctx.store.db.select().from(aiProposals).where(eq(aiProposals.id, proposalId)).get()!;
  return { id: row.id, kind: row.kind, summary: row.summary, payload: row.payload, status: row.status, resultNote: row.resultNote };
}

/** The most recent AI daily focus from today, used by the dashboard when available. */
export function todaysAiFocus(ctx: AppContext): { headline: string; points: string[] } | null {
  const d = today(ctx);
  const conv = ctx.store.db.select().from(aiConversations).where(eq(aiConversations.mode, "daily_focus")).orderBy(desc(aiConversations.id)).get();
  if (!conv || !conv.title.endsWith(d)) return null;
  const last = ctx.store.db.select().from(aiMessages).where(eq(aiMessages.conversationId, conv.id)).orderBy(desc(aiMessages.id)).all().find((m) => m.role === "assistant" && m.visible && m.displayText);
  if (!last) return null;
  const lines = last.displayText.split("\n").map((l) => l.replace(/^[-*•\d.\s]+/, "").trim()).filter(Boolean);
  return { headline: lines[0] ?? "Today's focus", points: lines.slice(1, 6) };
}
