// Minimal iCalendar (RFC 5545) reader for turning calendar events into quest suggestions.
// It reads VEVENT summary, start date/time and UID. Recurrence rules are not expanded:
// only each event's first occurrence is used.

export interface CalendarEvent {
  uid: string;
  title: string;
  /** Calendar date in the user's timezone (YYYY-MM-DD). */
  date: string;
  /** Local start time (HH:MM), or null for all-day events. */
  time: string | null;
  description: string;
  recurring: boolean;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** Wall-clock parts of a UTC instant in `timeZone`. */
function zonedParts(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function parseStart(params: string, value: string, timeZone: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  const date = `${y}-${mo}-${d}`;
  if (!h) return { date, time: null }; // all-day
  if (z) return zonedParts(new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!)), timeZone);
  // Floating or TZID times: the wall-clock time as written. For a different TZID, convert.
  const tzid = /TZID=([^;:]+)/i.exec(params)?.[1];
  if (tzid && tzid !== timeZone) {
    try {
      // Find the UTC instant whose wall clock in `tzid` matches, then express it in the user's zone.
      const guess = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!));
      const asTz = zonedParts(guess, tzid);
      const offsetMs = Date.UTC(+asTz.date.slice(0, 4), +asTz.date.slice(5, 7) - 1, +asTz.date.slice(8, 10), +asTz.time.slice(0, 2), +asTz.time.slice(3, 5)) - guess.getTime();
      return zonedParts(new Date(guess.getTime() - offsetMs), timeZone);
    } catch {
      /* unknown TZID: fall through to the written wall-clock time */
    }
  }
  return { date, time: `${h}:${mi}` };
}

export function parseIcs(text: string, timeZone: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let cur: Partial<CalendarEvent> & { start?: { date: string; time: string | null } } | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = { recurring: false, description: "" };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur?.start && cur.title) {
        events.push({ uid: cur.uid ?? `${cur.title}-${cur.start.date}`, title: cur.title, date: cur.start.date, time: cur.start.time, description: cur.description ?? "", recurring: cur.recurring ?? false });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...rest] = head.split(";");
    const params = rest.join(";");
    switch (name?.toUpperCase()) {
      case "SUMMARY":
        cur.title = unescape(value).trim().slice(0, 120);
        break;
      case "DESCRIPTION":
        cur.description = unescape(value).trim().slice(0, 1000);
        break;
      case "UID":
        cur.uid = value.trim();
        break;
      case "DTSTART":
        cur.start = parseStart(params, value, timeZone) ?? undefined;
        break;
      case "RRULE":
        cur.recurring = true;
        break;
    }
  }
  return events;
}
