import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { quests } from "../db/schema.js";
import { parseIcs, type CalendarEvent } from "../domain/ics.js";
import { addDays } from "../domain/dates.js";
import { badRequest } from "../errors.js";
import { createQuest } from "./quests.js";
import { getSettings, today } from "./settings.js";

export interface CalendarSuggestion extends CalendarEvent {
  alreadyImported: boolean;
}

const MAX_ICS_BYTES = 2_000_000;

/** Upcoming events (today + `days`) from an .ics export, marked if already imported. Changes nothing. */
export function previewCalendar(ctx: AppContext, ics: string, days = 30): CalendarSuggestion[] {
  if (ics.length > MAX_ICS_BYTES) throw badRequest("ICS_TOO_LARGE", "That calendar file is too large. Export a shorter date range.");
  if (!ics.includes("BEGIN:VCALENDAR")) throw badRequest("ICS_INVALID", "That doesn't look like an .ics calendar file.");
  const from = today(ctx);
  const to = addDays(from, days);
  return parseIcs(ics, getSettings(ctx).timezone)
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))
    .map((e) => ({ ...e, alreadyImported: isImported(ctx, e.title, e.date) }));
}

function isImported(ctx: AppContext, title: string, date: string): boolean {
  return Boolean(ctx.store.db.select({ id: quests.id }).from(quests).where(and(eq(quests.title, title), eq(quests.dueDate, date), eq(quests.frequency, "once"))).get());
}

/** Turns the events the user selected into one-time quests due on the event date. Skips duplicates. */
export function importCalendarEvents(ctx: AppContext, events: Array<{ title: string; date: string; time: string | null }>): { created: number; skipped: number } {
  let created = 0;
  let skipped = 0;
  ctx.store.tx(() => {
    for (const e of events) {
      if (isImported(ctx, e.title, e.date)) {
        skipped++;
        continue;
      }
      createQuest(ctx, { title: e.title, description: `From your calendar${e.time ? ` · ${e.time}` : ""}`, difficulty: "easy", frequency: "once", dueDate: e.date });
      created++;
    }
  });
  return { created, skipped };
}
