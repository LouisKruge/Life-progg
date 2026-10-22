import fs from "node:fs";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { ZodError, type ZodType } from "zod";
import type { AppContext } from "./context.js";
import { AppError } from "./errors.js";
import * as v from "./validation.js";
import { getSettings, listCategories, today, updateSettings } from "./services/settings.js";
import { completeOnboarding, loadDemoData, removeDemoData } from "./services/onboarding.js";
import { getDashboard } from "./services/dashboard.js";
import { getCharacter, listLedger } from "./services/progression.js";
import {
  completeInstance,
  createQuest,
  getQuest,
  listInstancesForDate,
  listQuests,
  listUpcoming,
  rescheduleQuest,
  setInstanceSkipped,
  setQuestArchived,
  undoInstance,
  updateQuest,
} from "./services/quests.js";
import { listSavingsGoals, recordSavingsEntry, setupSavingsGoal } from "./services/savings.js";
import { createBackup, exportJson, listBackups, restoreBackup } from "./services/backup.js";
import { recentEvents } from "./services/timeline.js";
import { bootstrap } from "./bootstrap.js";
import { syncCurrentAllowance } from "./services/rewards.js";
import { rewardRoutes } from "./routes/rewards.js";
import { wealthRoutes } from "./routes/wealth.js";
import { progressRoutes } from "./routes/progress.js";

export interface AppOptions {
  ctx: AppContext;
  clientDir?: string | null;
  dataDir?: string;
  logger?: boolean;
}

function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function buildApp({ ctx, clientDir = null, dataDir, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 1_048_576 });

  // Defence for a localhost app: browsers can't send custom headers cross-origin without a
  // CORS preflight (which we never approve), so this blocks drive-by requests from other sites.
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/") && MUTATING.has(req.method) && req.headers["x-level-one"] !== "1") {
      return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Missing X-Level-One header." } });
    }
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
          details: err.issues,
        },
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    }
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (typeof e.code === "string" && e.code.startsWith("SQLITE_CONSTRAINT")) {
      req.log.warn({ err }, "constraint violation");
      return reply.code(409).send({ error: { code: "CONSTRAINT", message: "That change conflicts with existing data." } });
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: e.code ?? "BAD_REQUEST", message: e.message ?? "Bad request." } });
    }
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Something went wrong. Your data was not changed." } });
  });

  const id = (req: FastifyRequest) => parse(v.idParam, req.params).id;

  // ---- System ----
  app.get("/api/health", async () => ({ ok: true, today: today(ctx) }));
  app.get("/api/system", async () => ({ dataDir: dataDir ?? null, version: "0.1.0" }));

  // ---- Settings & onboarding ----
  app.get("/api/settings", async () => getSettings(ctx));
  app.patch("/api/settings", async (req) => {
    const patch = parse(v.settingsPatchSchema, req.body);
    const settings = updateSettings(ctx, patch);
    if (patch.monthlyRewardAllowanceCents !== undefined) syncCurrentAllowance(ctx);
    return settings;
  });
  app.get("/api/categories", async () => listCategories(ctx));
  app.post("/api/onboarding", async (req) => completeOnboarding(ctx, parse(v.onboardingSchema, req.body ?? {})));
  app.post("/api/demo-data", async () => {
    loadDemoData(ctx);
    return { ok: true };
  });
  app.delete("/api/demo-data", async () => removeDemoData(ctx));

  // ---- Dashboard & character ----
  app.get("/api/dashboard", async () => getDashboard(ctx));
  app.get("/api/character", async () => getCharacter(ctx));
  app.get("/api/ledger", async () => listLedger(ctx, 100));
  app.get("/api/timeline/recent", async () => recentEvents(ctx, 50));

  // ---- Quests ----
  app.get("/api/quests", async (req) => {
    const q = req.query as { includeArchived?: string };
    return listQuests(ctx, { includeArchived: q.includeArchived === "true" });
  });
  app.post("/api/quests", async (req, reply) => reply.code(201).send(createQuest(ctx, parse(v.questCreateSchema, req.body))));
  app.get("/api/quests/:id", async (req) => getQuest(ctx, id(req)));
  app.patch("/api/quests/:id", async (req) => updateQuest(ctx, id(req), parse(v.questUpdateSchema, req.body)));
  app.post("/api/quests/:id/archive", async (req) => setQuestArchived(ctx, id(req), parse(v.archiveSchema, req.body).archived));
  app.post("/api/quests/:id/reschedule", async (req) => rescheduleQuest(ctx, id(req), parse(v.rescheduleSchema, req.body).dueDate));
  app.get("/api/quest-board", async () => {
    const date = today(ctx);
    return { date, today: listInstancesForDate(ctx, date), upcoming: listUpcoming(ctx, date) };
  });
  app.post("/api/instances/:id/complete", async (req) => completeInstance(ctx, id(req), parse(v.completeSchema, req.body ?? undefined)));
  app.post("/api/instances/:id/undo", async (req) => undoInstance(ctx, id(req)));
  app.post("/api/instances/:id/skip", async (req) => setInstanceSkipped(ctx, id(req), parse(v.skipSchema, req.body).skipped));

  // ---- Savings (dashboard quick actions; the full Wealth Center arrives in phase 3) ----
  app.get("/api/savings-goals", async () => listSavingsGoals(ctx));
  app.post("/api/savings-goals", async (req, reply) => reply.code(201).send(setupSavingsGoal(ctx, parse(v.savingsGoalSchema, req.body))));
  app.post("/api/savings-goals/:id/entries", async (req) => recordSavingsEntry(ctx, id(req), parse(v.savingsEntrySchema, req.body)));

  rewardRoutes(app, ctx);
  wealthRoutes(app, ctx);
  progressRoutes(app, ctx);

  // ---- Backup & export ----
  app.get("/api/backups", async () => listBackups(ctx));
  app.post("/api/backups", async (req, reply) => reply.code(201).send(createBackup(ctx)));
  app.post("/api/backups/restore", async (req) => restoreBackup(ctx, parse(v.restoreSchema, req.body).fileName, bootstrap));
  app.get("/api/export", async (_req, reply: FastifyReply) => {
    reply.header("Content-Disposition", `attachment; filename="levelone-export-${today(ctx)}.json"`);
    return exportJson(ctx);
  });

  app.all("/api/*", async (_req, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Unknown API route." } }));

  if (clientDir && fs.existsSync(clientDir)) {
    app.register(fastifyStatic, { root: clientDir, wildcard: false });
    // Client-side routing: unknown non-API paths return the app shell.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api/")) return reply.sendFile("index.html");
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found." } });
    });
  }

  return app;
}
