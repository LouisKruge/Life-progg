import { describe, expect, it } from "vitest";
import { parseIcs } from "../../src/server/domain/ics.js";
import { makeCtx } from "../helpers.js";
import { importCalendarEvents, previewCalendar } from "../../src/server/services/calendar.js";
import { listQuests } from "../../src/server/services/quests.js";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:abc@google.com",
  "DTSTART:20261023T060000Z",
  "SUMMARY:Dentist\\, Dr Naidoo",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:allday",
  "DTSTART;VALUE=DATE:20261025",
  "SUMMARY:Mom's birthday lunch",
  "RRULE:FREQ=YEARLY",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:london",
  "DTSTART;TZID=Europe/London:20261024T090000",
  "SUMMARY:Call with the London",
  "  team",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:old",
  "DTSTART:20250101T080000Z",
  "SUMMARY:Last year",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("ics parsing", () => {
  it("reads summaries, all-day and timed events, folding and timezones", () => {
    const events = parseIcs(ICS, "Africa/Johannesburg");
    expect(events.find((e) => e.uid === "abc@google.com")).toMatchObject({ title: "Dentist, Dr Naidoo", date: "2026-10-23", time: "08:00" });
    expect(events.find((e) => e.uid === "allday")).toMatchObject({ date: "2026-10-25", time: null, recurring: true });
    // 09:00 in London (BST, UTC+1) is 10:00 in Johannesburg.
    expect(events.find((e) => e.uid === "london")).toMatchObject({ title: "Call with the London team", time: "10:00" });
  });
});

describe("calendar import", () => {
  it("previews upcoming events without changing anything, then imports only selected ones once", () => {
    const ctx = makeCtx();
    const preview = previewCalendar(ctx, ICS);
    expect(preview.map((e) => e.title)).toEqual(["Dentist, Dr Naidoo", "Call with the London team", "Mom's birthday lunch"]);
    expect(listQuests(ctx)).toHaveLength(0);
    const dentist = preview[0]!;
    expect(importCalendarEvents(ctx, [dentist])).toEqual({ created: 1, skipped: 0 });
    expect(importCalendarEvents(ctx, [dentist])).toEqual({ created: 0, skipped: 1 });
    expect(listQuests(ctx)[0]).toMatchObject({ title: "Dentist, Dr Naidoo", frequency: "once", dueDate: "2026-10-23" });
    expect(previewCalendar(ctx, ICS)[0]!.alreadyImported).toBe(true);
    expect(() => previewCalendar(ctx, "hello")).toThrow();
  });
});
