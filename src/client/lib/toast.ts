import { createStore } from "./store";

export interface ToastItem {
  id: number;
  kind: "info" | "error" | "reward";
  title: string;
  detail?: string;
}

export const toastStore = createStore<ToastItem[]>([]);
let nextId = 1;

function push(kind: ToastItem["kind"], title: string, detail?: string) {
  const id = nextId++;
  toastStore.set((list) => [...list.slice(-3), { id, kind, title, detail }]);
  setTimeout(() => dismissToast(id), kind === "error" ? 6000 : 3200);
}

export function dismissToast(id: number) {
  toastStore.set((list) => list.filter((t) => t.id !== id));
}

export const toast = {
  info: (title: string, detail?: string) => push("info", title, detail),
  error: (title: string, detail?: string) => push("error", title, detail),
  reward: (title: string, detail?: string) => push("reward", title, detail),
};
