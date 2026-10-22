import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server/app.js";
import { makeCtx } from "../helpers.js";

let app: FastifyInstance;
const H = { "x-level-one": "1" };

beforeEach(async () => {
  app = buildApp({ ctx: makeCtx() });
  await app.ready();
});
afterEach(async () => {
  await app.close();
});

describe("API", () => {
  it("serves health and default settings", async () => {
    expect((await app.inject({ url: "/api/health" })).json()).toEqual({ ok: true, today: "2026-10-22" });
    const s = (await app.inject({ url: "/api/settings" })).json();
    expect(s).toMatchObject({ onboarded: false, currency: "ZAR", locale: "en-ZA", hasApiKey: false });
    expect(s).not.toHaveProperty("anthropicApiKey");
  });

  it("blocks mutations without the anti-CSRF header", async () => {
    const res = await app.inject({ method: "POST", url: "/api/onboarding", payload: {} });
    expect(res.statusCode).toBe(403);
  });

  it("returns readable validation errors", async () => {
    const res = await app.inject({ method: "POST", url: "/api/quests", headers: H, payload: { title: "", difficulty: "legendary", frequency: "daily" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("runs the core loop: onboard, create quest, complete, undo", async () => {
    expect((await app.inject({ method: "POST", url: "/api/onboarding", headers: H, payload: { displayName: "Louis" } })).statusCode).toBe(200);
    const quest = (
      await app.inject({ method: "POST", url: "/api/quests", headers: H, payload: { title: "Read", difficulty: "medium", frequency: "daily" } })
    ).json();
    expect(quest.id).toBeGreaterThan(0);

    const dash = (await app.inject({ url: "/api/dashboard" })).json();
    expect(dash.character.displayName).toBe("Louis");
    expect(dash.completion).toEqual({ done: 0, total: 1, percent: 0 });
    const instanceId = dash.quests[0].instanceId;

    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: `/api/instances/${instanceId}/complete`, headers: H, payload: {} }),
      app.inject({ method: "POST", url: `/api/instances/${instanceId}/complete`, headers: H, payload: {} }),
    ]);
    expect([a.json().alreadyCompleted, b.json().alreadyCompleted].sort()).toEqual([false, true]);

    const after = (await app.inject({ url: "/api/dashboard" })).json();
    expect(after.character.credits).toBe(10);
    expect(after.character.level.totalXp).toBe(100);
    expect(after.completion.percent).toBe(100);

    const undo = await app.inject({ method: "POST", url: `/api/instances/${instanceId}/undo`, headers: H });
    expect(undo.json().character.credits).toBe(0);
    const again = await app.inject({ method: "POST", url: `/api/instances/${instanceId}/undo`, headers: H });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("NOT_COMPLETED");
  });

  it("returns 404 for unknown resources and API routes", async () => {
    expect((await app.inject({ method: "POST", url: "/api/instances/999/complete", headers: H, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/nope" })).statusCode).toBe(404);
  });

  it("never returns the API key", async () => {
    const res = await app.inject({ method: "PATCH", url: "/api/settings", headers: H, payload: { anthropicApiKey: "sk-ant-abcdefghijk" } });
    expect(res.json().hasApiKey).toBe(true);
    expect(res.body).not.toContain("sk-ant");
  });
});
