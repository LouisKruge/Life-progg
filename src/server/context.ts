import type { Store } from "./db/store.js";

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Everything a service needs. Passed explicitly so tests can swap the clock and database. */
export interface AppContext {
  store: Store;
  clock: Clock;
}
