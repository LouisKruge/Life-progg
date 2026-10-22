import { describe, expect, it } from "vitest";
import { addDays, addMonthsToMonth, dateInTimezone, isoWeekKey, isValidDate, startOfIsoWeek, weekday } from "../../src/server/domain/dates.js";
import { monthsToTarget } from "../../src/server/services/savings.js";

describe("dates", () => {
  it("resolves the calendar date in the user's timezone", () => {
    // 23:30 UTC on the 21st is already the 22nd in Johannesburg (UTC+2).
    expect(dateInTimezone(new Date("2026-10-21T23:30:00Z"), "Africa/Johannesburg")).toBe("2026-10-22");
    expect(dateInTimezone(new Date("2026-10-21T23:30:00Z"), "UTC")).toBe("2026-10-21");
  });

  it("validates dates strictly", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("26-1-1")).toBe(false);
  });

  it("computes ISO weeks and weekdays", () => {
    expect(weekday("2026-10-22")).toBe(4);
    expect(isoWeekKey("2026-10-22")).toBe("2026-W43");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(startOfIsoWeek("2026-10-25")).toBe("2026-10-19");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonthsToMonth("2026-10-22", 3)).toBe("2027-01");
  });
});

describe("savings projections", () => {
  it("calculates months to target from the planned contribution", () => {
    // R6,000 saved, R20,000 target, R5,000 per month -> 3 months (R21,000).
    expect(monthsToTarget(600_000, 2_000_000, 500_000)).toBe(3);
    expect(monthsToTarget(600_000, 10_000_000, 500_000)).toBe(19);
    expect(monthsToTarget(2_000_000, 2_000_000, 500_000)).toBe(0);
    expect(monthsToTarget(0, 100, null)).toBeNull();
    expect(monthsToTarget(0, 100, 0)).toBeNull();
  });
});
