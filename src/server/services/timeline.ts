import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { timelineEvents } from "../db/schema.js";
import type { TimelineEvent, TimelineItem, TimelinePage } from "../../shared/types.js";
import { conflict, notFound } from "../errors.js";

export interface NewTimelineEvent {
  type: string;
  title: string;
  detail?: string;
  categoryId?: number | null;
  sourceType?: string;
  sourceId?: number;
  data?: Record<string, unknown>;
}

export function addTimelineEvent(ctx: AppContext, e: NewTimelineEvent): number {
  return ctx.store.db
    .insert(timelineEvents)
    .values({
      type: e.type,
      title: e.title,
      detail: e.detail ?? "",
      categoryId: e.categoryId ?? null,
      sourceType: e.sourceType ?? null,
      sourceId: e.sourceId ?? null,
      occurredAt: ctx.clock.now().toISOString(),
      data: e.data ?? null,
    })
    .returning({ id: timelineEvents.id })
    .get().id;
}

/** Removes events that were produced by a source that has since been undone (e.g. an undone completion). */
export function removeEventsForSource(ctx: AppContext, sourceType: string, sourceId: number): void {
  ctx.store.db
    .delete(timelineEvents)
    .where(and(eq(timelineEvents.sourceType, sourceType), eq(timelineEvents.sourceId, sourceId)))
    .run();
}

export function recentEvents(ctx: AppContext, limit = 10): TimelineEvent[] {
  return ctx.store.db
    .select()
    .from(timelineEvents)
    .orderBy(desc(timelineEvents.occurredAt), desc(timelineEvents.id))
    .limit(limit)
    .all()
    .map((e) => ({ id: e.id, type: e.type, title: e.title, detail: e.detail, occurredAt: e.occurredAt }));
}

export interface TimelineQuery {
  types?: string[];
  categoryId?: number;
  /** Inclusive ISO timestamps. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function queryTimeline(ctx: AppContext, q: TimelineQuery): TimelinePage {
  const conds = [];
  if (q.types?.length) conds.push(inArray(timelineEvents.type, q.types));
  if (q.categoryId) conds.push(eq(timelineEvents.categoryId, q.categoryId));
  if (q.from) conds.push(gte(timelineEvents.occurredAt, q.from));
  if (q.to) conds.push(lte(timelineEvents.occurredAt, q.to));
  const where = conds.length ? and(...conds) : undefined;
  const items = ctx.store.db
    .select()
    .from(timelineEvents)
    .where(where)
    .orderBy(desc(timelineEvents.occurredAt), desc(timelineEvents.id))
    .limit(Math.min(q.limit ?? 200, 1000))
    .offset(q.offset ?? 0)
    .all()
    .map((e): TimelineItem => ({ id: e.id, type: e.type, title: e.title, detail: e.detail, occurredAt: e.occurredAt, categoryId: e.categoryId, data: e.data ?? null }));
  const total = Number(ctx.store.db.select({ n: sql<number>`COUNT(*)` }).from(timelineEvents).where(where).get()?.n ?? 0);
  const types = ctx.store.db.selectDistinct({ t: timelineEvents.type }).from(timelineEvents).all().map((r) => r.t).sort();
  return { items, total, types };
}

/** A personal note or significant life event written by the user. */
export function addNote(ctx: AppContext, input: { title: string; detail?: string; categoryId?: number | null; kind?: "note" | "event" }): TimelineItem {
  const id = addTimelineEvent(ctx, { type: input.kind === "event" ? "life_event" : "note", title: input.title, detail: input.detail, categoryId: input.categoryId ?? null });
  return queryTimeline(ctx, { limit: 1000 }).items.find((i) => i.id === id)!;
}

/** Only things the user wrote can be deleted; system history is permanent. */
export function deleteNote(ctx: AppContext, id: number): void {
  const e = ctx.store.db.select().from(timelineEvents).where(eq(timelineEvents.id, id)).get();
  if (!e) throw notFound("Timeline entry");
  if (e.type !== "note" && e.type !== "life_event") throw conflict("SYSTEM_EVENT", "Only your own notes can be deleted.");
  ctx.store.db.delete(timelineEvents).where(eq(timelineEvents.id, id)).run();
}
