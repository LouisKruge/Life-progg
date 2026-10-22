import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context.js";
import * as v from "../validation.js";
import { runPlanner } from "../services/planner.js";
import { aiStatus, decideProposal, deleteConversation, getConversation, listConversations, sendMessage } from "../services/strategist.js";
import { importCalendarEvents, previewCalendar } from "../services/calendar.js";
import { idOf, parse } from "./util.js";

export function aiRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/api/ai/status", async () => aiStatus(ctx));
  app.get("/api/ai/planner", async () => runPlanner(ctx));
  app.get("/api/ai/conversations", async () => listConversations(ctx));
  app.get("/api/ai/conversations/:id", async (req) => getConversation(ctx, idOf(req)));
  app.delete("/api/ai/conversations/:id", async (req, reply) => {
    deleteConversation(ctx, idOf(req));
    return reply.code(204).send();
  });
  app.post("/api/ai/messages", async (req) => sendMessage(ctx, parse(v.aiMessageSchema, req.body)));
  // Optional calendar integration: .ics export -> previewed suggestions -> quests the user picks.
  app.post("/api/integrations/calendar/preview", async (req) => {
    const b = parse(v.icsPreviewSchema, req.body);
    return previewCalendar(ctx, b.ics, b.days);
  });
  app.post("/api/integrations/calendar/import", async (req) => importCalendarEvents(ctx, parse(v.icsImportSchema, req.body).events));
  app.post("/api/ai/proposals/:id", async (req) => decideProposal(ctx, idOf(req), parse(v.proposalDecisionSchema, req.body).approve));
}
