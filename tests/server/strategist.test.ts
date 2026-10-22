import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { makeCtx } from "../helpers.js";
import { AppError } from "../../src/server/errors.js";
import { updateSettings } from "../../src/server/services/settings.js";
import { createQuest, listInstancesForDate, listQuests } from "../../src/server/services/quests.js";
import { creditBalance, totalXp } from "../../src/server/services/progression.js";
import { aiStatus, decideProposal, getConversation, sendMessage, setMessagesClientFactory, todaysAiFocus, type MessagesClient } from "../../src/server/services/strategist.js";
import { runPlanner } from "../../src/server/services/planner.js";
import { completeOnboarding } from "../../src/server/services/onboarding.js";
import { getDashboard } from "../../src/server/services/dashboard.js";
import { queryTimeline } from "../../src/server/services/timeline.js";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type Block = Anthropic.Beta.BetaContentBlock;

/** Scripted fake: returns queued responses and records every request it received. */
class FakeClaude implements MessagesClient {
  requests: Params[] = [];
  constructor(private script: Array<{ stop: Anthropic.Beta.BetaMessage["stop_reason"]; content: unknown[] }>) {}
  async create(params: Params) {
    this.requests.push(structuredClone(params));
    const next = this.script.shift();
    if (!next) throw new Error("FakeClaude: no scripted response left");
    return { id: `msg_${this.requests.length}`, type: "message", role: "assistant", model: params.model, content: next.content as Block[], stop_reason: next.stop, stop_sequence: null, usage: {} } as unknown as Anthropic.Beta.BetaMessage;
  }
}

const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

let ctx: ReturnType<typeof makeCtx>;
let fake: FakeClaude;
function script(s: ConstructorParameters<typeof FakeClaude>[0]) {
  fake = new FakeClaude(s);
  setMessagesClientFactory(() => fake);
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
  throw new Error("expected error");
};

beforeEach(() => {
  ctx = makeCtx();
  completeOnboarding(ctx, { displayName: "Louis" });
  updateSettings(ctx, { anthropicApiKey: "sk-ant-test-0123456789", aiEnabled: true });
});
afterAll(() => setMessagesClientFactory(() => { throw new Error("no real API in tests"); }));

describe("configuration", () => {
  it("requires a key and the feature switch, and never exposes the key", async () => {
    const fresh = makeCtx();
    expect(await code(sendMessage(fresh, { text: "hi" }))).toBe("AI_NOT_CONFIGURED");
    updateSettings(fresh, { anthropicApiKey: "sk-ant-test-0123456789", aiEnabled: false });
    expect(await code(sendMessage(fresh, { text: "hi" }))).toBe("AI_DISABLED");
    expect(JSON.stringify(aiStatus(fresh))).not.toContain("sk-ant");
    expect(aiStatus(fresh).model).toBe("claude-opus-5-5");
  });

  it("sends the configured model, effort, fallbacks and only the tools for allowed data", async () => {
    script([{ stop: "end_turn", content: [text("Hello Louis.")] }]);
    await sendMessage(ctx, { text: "Hi" });
    const req = fake.requests[0]!;
    expect(req).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "medium" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    const names = (req.tools ?? []).map((t) => (t as { name: string }).name);
    // Default scopes: quests, progression, seasons. Finances, rewards and journal are private.
    expect(names).toEqual(expect.arrayContaining(["get_today_quests", "get_character", "propose_quest", "get_active_season"]));
    expect(names).not.toContain("get_finances");
    expect(names).not.toContain("get_rewards");
    expect(names).not.toContain("get_recent_timeline");
    // The date travels in the user turn, keeping the system prompt stable for caching.
    expect(JSON.stringify(req.system)).not.toContain("2026-10-22");
    expect(JSON.stringify(req.messages[0])).toContain("2026-10-22");
  });
});

describe("tool loop", () => {
  it("reads data, stores proposals without changing anything, and replays history unchanged", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "sig-abc" };
    script([
      { stop: "tool_use", content: [thinking, toolUse("t1", "get_character", {}), toolUse("t2", "propose_quest", { title: "Read 10 pages", difficulty: "easy", frequency: "daily", categoryKey: "mind", reason: "Mind is a focus area." })] },
      { stop: "end_turn", content: [text("I've proposed a reading quest. It's waiting for your approval.")] },
    ]);
    const conv = await sendMessage(ctx, { text: "Suggest one habit" });
    expect(listQuests(ctx)).toHaveLength(0);
    expect(conv.proposals).toEqual([expect.objectContaining({ kind: "create_quest", status: "pending" })]);
    expect(conv.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(conv.messages[1]!.toolsUsed).toEqual(["get_character", "propose_quest"]);

    // Second request carries the assistant turn exactly as received, then the tool results.
    const second = fake.requests[1]!.messages;
    expect(second[1]).toEqual({ role: "assistant", content: [thinking, toolUse("t1", "get_character", {}), expect.objectContaining({ name: "propose_quest" })] });
    const results = second[2]!.content as Array<{ tool_use_id: string; content: string; is_error?: boolean }>;
    expect(JSON.parse(results[0]!.content)).toMatchObject({ source: "LEVEL ONE database", data: { level: 1 } });
    expect(JSON.parse(results[1]!.content).data.status).toBe("pending_user_approval");

    // A follow-up message replays the full stored history append-only.
    script([{ stop: "end_turn", content: [text("Sure.")] }]);
    await sendMessage(ctx, { conversationId: conv.id, text: "Thanks" });
    const replay = fake.requests[0]!.messages;
    expect(replay).toHaveLength(5);
    expect(replay[1]).toEqual(second[1]);
  });

  it("refuses tools outside the allowed data categories", async () => {
    script([
      { stop: "tool_use", content: [toolUse("t1", "get_finances", {})] },
      { stop: "end_turn", content: [text("Your finances aren't shared with me.")] },
    ]);
    await sendMessage(ctx, { text: "How much have I saved?" });
    const result = (fake.requests[1]!.messages[2]!.content as Array<{ is_error: boolean; content: string }>)[0]!;
    expect(result).toMatchObject({ is_error: true });
    expect(result.content).toMatch(/not shared/);

    updateSettings(ctx, { aiDataScopes: ["finances"] });
    expect(aiStatus(ctx).tools.map((t) => t.name)).toEqual(["get_finances"]);
  });

  it("rejects invalid tool input without storing anything", async () => {
    script([
      { stop: "tool_use", content: [toolUse("t1", "propose_quest", { title: "", difficulty: "legendary", frequency: "daily", reason: "x" })] },
      { stop: "end_turn", content: [text("Sorry.")] },
    ]);
    const conv = await sendMessage(ctx, { text: "Add something" });
    expect(conv.proposals).toHaveLength(0);
    expect((fake.requests[1]!.messages[2]!.content as Array<{ is_error: boolean }>)[0]!.is_error).toBe(true);
  });

  it("handles a refusal stop reason gracefully", async () => {
    script([{ stop: "refusal", content: [] }]);
    const conv = await sendMessage(ctx, { text: "something disallowed" });
    expect(conv.messages.at(-1)!.text).toMatch(/can't help/);
  });

  it("stops after the tool-round limit instead of looping forever", async () => {
    script(Array.from({ length: 8 }, (_, i) => ({ stop: "tool_use" as const, content: [toolUse(`t${i}`, "get_character", {})] })));
    const conv = await sendMessage(ctx, { text: "loop" });
    expect(fake.requests).toHaveLength(8);
    expect(conv.messages.at(-1)!.text).toMatch(/stopped before finishing/);
  });
});

describe("proposals need explicit approval", () => {
  it("creates a quest only after approval, once", async () => {
    script([
      { stop: "tool_use", content: [toolUse("t1", "propose_quest", { title: "Walk", difficulty: "easy", frequency: "daily", reason: "Energy" })] },
      { stop: "end_turn", content: [text("Proposed.")] },
    ]);
    const conv = await sendMessage(ctx, { text: "x" });
    const id = conv.proposals[0]!.id;
    expect(decideProposal(ctx, id, true)).toMatchObject({ status: "approved" });
    expect(listQuests(ctx).map((q) => q.title)).toEqual(["Walk"]);
    expect(() => decideProposal(ctx, id, true)).toThrow(AppError);
    expect(listQuests(ctx)).toHaveLength(1);
  });

  it("never awards XP for a completion until approved, and never twice", async () => {
    const q = createQuest(ctx, { title: "Gym", difficulty: "medium", frequency: "daily" });
    const inst = listInstancesForDate(ctx, "2026-10-22").find((i) => i.quest.id === q.id)!;
    script([
      { stop: "tool_use", content: [toolUse("a", "propose_quest_completion", { instanceId: inst.instanceId, reason: "You said you trained." }), toolUse("b", "propose_quest_completion", { instanceId: inst.instanceId, reason: "dup" })] },
      { stop: "end_turn", content: [text("Waiting for your confirmation.")] },
    ]);
    const conv = await sendMessage(ctx, { text: "I went to the gym" });
    expect(totalXp(ctx)).toBe(0);
    const [first, second] = conv.proposals;
    decideProposal(ctx, first!.id, true);
    expect(totalXp(ctx)).toBe(100);
    expect(decideProposal(ctx, second!.id, true).resultNote).toMatch(/already completed/);
    expect(totalXp(ctx)).toBe(100);
    expect(creditBalance(ctx)).toBe(10);
  });

  it("rejecting changes nothing; notes need the journal scope", async () => {
    updateSettings(ctx, { aiDataScopes: ["journal"] });
    script([
      { stop: "tool_use", content: [toolUse("t1", "propose_note", { title: "Felt focused today" })] },
      { stop: "end_turn", content: [text("Want me to save that?")] },
    ]);
    const conv = await sendMessage(ctx, { text: "reflect" });
    decideProposal(ctx, conv.proposals[0]!.id, false);
    expect(queryTimeline(ctx, { types: ["note"] }).total).toBe(0);
  });
});

describe("daily focus and planner mode", () => {
  it("uses today's AI focus on the dashboard when one exists", async () => {
    expect(getDashboard(ctx).focus.source).toBe("planner");
    script([{ stop: "end_turn", content: [text("Protect your energy today.\n- Do the hard quest first\n- Take a proper lunch break")] }]);
    await sendMessage(ctx, { text: "What should I focus on?", mode: "daily_focus" });
    expect(todaysAiFocus(ctx)).toEqual({ headline: "Protect your energy today.", points: ["Do the hard quest first", "Take a proper lunch break"] });
    expect(getDashboard(ctx).focus).toMatchObject({ source: "ai", headline: "Protect your energy today." });
    expect(getConversation(ctx, 1).mode).toBe("daily_focus");
  });

  it("plans without any AI from real data", () => {
    const fresh = makeCtx();
    completeOnboarding(fresh, { focusCategories: ["physique"] });
    createQuest(fresh, { title: "Deep work", difficulty: "hard", frequency: "daily" });
    createQuest(fresh, { title: "Floss", difficulty: "trivial", frequency: "daily" });
    const p = runPlanner(fresh);
    expect(p.dailyPlan.steps[0]).toContain("Deep work");
    expect(p.dailyPlan.steps.at(-1)).toMatch(/enjoy/);
    expect(p.suggestions.find((s) => s.categoryKey === "physique")?.title).toBe("Move for 20 minutes");
    expect(p.weeklyReview.completed).toBe(0);
    expect(p.reflectionPrompts).toHaveLength(3);
  });
});
