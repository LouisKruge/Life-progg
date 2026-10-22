import { createStore } from "./store";

export const celebrationStore = createStore<{ level: number; rank: string } | null>(null);

export function celebrate(payload: { level: number; rank: string }) {
  celebrationStore.set(payload);
}
