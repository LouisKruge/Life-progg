/** Formatting helpers. Locale and currency come from user settings (defaults en-ZA / ZAR). */

export function formatMoney(cents: number, currency = "ZAR", locale = "en-ZA", opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? cents % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format(cents / 100);
}

/**
 * Parses user-entered money ("R 6 000", "6000,50", "6,000.50") into integer cents.
 * Returns null for empty input and NaN for anything unparseable.
 */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[R\s ]/gi, "").trim();
  if (s === "") return null;
  const negative = s.startsWith("-");
  s = s.replace(/^-/, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  // Whichever separator comes last with 1-2 trailing digits is the decimal mark.
  const decIndex = Math.max(lastComma, lastDot);
  let intPart = s;
  let frac = "";
  if (decIndex !== -1 && s.length - decIndex - 1 <= 2) {
    intPart = s.slice(0, decIndex);
    frac = s.slice(decIndex + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(intPart || "0") || !/^\d{0,2}$/.test(frac)) return Number.NaN;
  const cents = Number(intPart || "0") * 100 + Number(frac.padEnd(2, "0") || "0");
  return negative ? -cents : cents;
}

export function formatNumber(n: number, locale = "en-ZA"): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDate(date: string, locale = "en-ZA", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  const d = date.length === 10 ? new Date(`${date}T12:00:00Z`) : new Date(date);
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: date.length === 10 ? "UTC" : undefined }).format(d);
}

export function formatLongDate(date: string, locale = "en-ZA"): string {
  return formatDate(date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatDateTime(iso: string, locale = "en-ZA", timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function greeting(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
