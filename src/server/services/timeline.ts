import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { timelineEvents } from "../db/schema.js";
import type { TimelineEvent } from "../../shared/types.js";

export interface NewTimelineEvent {
  type: string;
  title: string;
  detail?: string;
  categoryId?: number | null;
  sourceType?: string;
  sourceId?: number;
}

export function addTimelineEvent(ctx: AppContext, e: NewTimelineEvent): void {
  ctx.store.db
    .insert(timelineEvents)
    .values({
      type: e.type,
      title: e.title,
      detail: e.detail ?? "",
      categoryId: e.categoryId ?? null,
      sourceType: e.sourceType ?? null,
      sourceId: e.sourceId ?? null,
      occurredAt: ctx.clock.now().toISOString(),
    })
    .run();
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
