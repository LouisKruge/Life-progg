// Pure financial maths. All amounts are integer cents; results are rounded to whole cents.

export interface PayoffForecast {
  months: number;
  totalInterestCents: number;
}

/**
 * Months to clear a debt paying `paymentCents` monthly, with interest compounded monthly at
 * `aprBps / 12`. Returns null when the payment never outpaces the interest (or exceeds 600 months).
 */
export function debtPayoff(balanceCents: number, aprBps: number, paymentCents: number): PayoffForecast | null {
  if (balanceCents <= 0) return { months: 0, totalInterestCents: 0 };
  if (paymentCents <= 0) return null;
  const monthlyRate = aprBps / 10_000 / 12;
  let balance = balanceCents;
  let interestTotal = 0;
  for (let month = 1; month <= 600; month++) {
    const interest = Math.round(balance * monthlyRate);
    if (paymentCents <= interest) return null;
    interestTotal += interest;
    balance = balance + interest - paymentCents;
    if (balance <= 0) return { months: month, totalInterestCents: interestTotal };
  }
  return null;
}

/** Projected balance at the end of each of the next `months` months, from planned contributions only. */
export function savingsSeries(startCents: number, monthlyCents: number, months: number): number[] {
  return Array.from({ length: months }, (_, i) => startCents + monthlyCents * (i + 1));
}

/** Months until `target` is reached from `saved` at `monthly` per month; 0 if reached, null if never. */
export function monthsToTarget(savedCents: number, targetCents: number, monthlyCents: number | null): number | null {
  if (savedCents >= targetCents) return 0;
  if (!monthlyCents || monthlyCents <= 0) return null;
  return Math.ceil((targetCents - savedCents) / monthlyCents);
}

/** YYYY-MM of a YYYY-MM-DD date. */
export const monthOf = (date: string) => date.slice(0, 7);

/** First and last calendar day of a YYYY-MM month. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

/** Shift a YYYY-MM month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
