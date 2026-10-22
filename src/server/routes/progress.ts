import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import * as v from "../validation.js";
import { createCustomAchievement, deleteCustomAchievement, listAchievements, markUnlocksSeen, unlockManually, unseenUnlocks } from "../services/achievements.js";
import { listSkillTrees } from "../services/skills.js";
import {
  activateSeason,
  addSeasonGoal,
  completeSeason,
  createSeason,
  getSeason,
  listSeasons,
  saveWeeklyReview,
  setSeasonArchived,
  updateSeason,
  updateSeasonGoal,
} from "../services/seasons.js";
import { addNote, deleteNote, queryTimeline } from "../services/timeline.js";
import { takeSnapshot } from "../services/metrics.js";
import { idOf, parse } from "./util.js";

export function progressRoutes(app: FastifyInstance, ctx: AppContext) {
  // Achievements & skills
  app.get("/api/achievements", async () => listAchievements(ctx));
  app.post("/api/achievements", async (req, reply) => reply.code(201).send(createCustomAchievement(ctx, parse(v.customAchievementSchema, req.body))));
  app.post("/api/achievements/:id/unlock", async (req) => unlockManually(ctx, idOf(req), parse(v.unlockSchema, req.body ?? {}).evidence));
  app.delete("/api/achievements/:id", async (req, reply) => {
    deleteCustomAchievement(ctx, idOf(req));
    return reply.code(204).send();
  });
  app.get("/api/skills", async () => listSkillTrees(ctx));
  app.get("/api/unlocks/unseen", async () => unseenUnlocks(ctx));
  app.post("/api/unlocks/seen", async () => {
    markUnlocksSeen(ctx);
    return { ok: true };
  });

  // Seasons
  app.get("/api/seasons", async () => listSeasons(ctx));
  app.get("/api/seasons/:id", async (req) => getSeason(ctx, idOf(req)));
  app.post("/api/seasons", async (req, reply) => reply.code(201).send(createSeason(ctx, parse(v.seasonSchema, req.body))));
  app.patch("/api/seasons/:id", async (req) => updateSeason(ctx, idOf(req), parse(v.seasonPatchSchema, req.body)));
  app.post("/api/seasons/:id/activate", async (req) => activateSeason(ctx, idOf(req)));
  app.post("/api/seasons/:id/complete", async (req) => completeSeason(ctx, idOf(req)));
  app.post("/api/seasons/:id/archive", async (req) => setSeasonArchived(ctx, idOf(req), parse(v.archiveSchema, req.body).archived));
  app.post("/api/seasons/:id/goals", async (req) => addSeasonGoal(ctx, idOf(req), parse(v.seasonGoalSchema, req.body)));
  app.patch("/api/season-goals/:id", async (req) => updateSeasonGoal(ctx, idOf(req), parse(v.seasonGoalPatchSchema, req.body)));
  app.put("/api/seasons/:id/review", async (req) => saveWeeklyReview(ctx, idOf(req), parse(v.reviewSchema, req.body)));

  // Timeline
  app.get("/api/timeline", async (req) => {
    const q = req.query as { types?: string; categoryId?: string; from?: string; to?: string; limit?: string; offset?: string };
    return queryTimeline(ctx, {
      types: q.types ? q.types.split(",").filter(Boolean) : undefined,
      categoryId: q.categoryId ? Number(q.categoryId) : undefined,
      from: q.from,
      to: q.to,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });
  app.post("/api/timeline/notes", async (req, reply) => reply.code(201).send(addNote(ctx, parse(v.noteSchema, req.body))));
  app.delete("/api/timeline/:id", async (req, reply) => {
    deleteNote(ctx, idOf(req));
    return reply.code(204).send();
  });
  app.post("/api/timeline/snapshot", async (req, reply) => {
    const id = takeSnapshot(ctx, parse(v.snapshotSchema, req.body ?? undefined).label);
    return reply.code(201).send({ id });
  });
}
