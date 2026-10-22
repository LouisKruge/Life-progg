import type { Quest } from "@shared/types";
import { createStore } from "./store";

/** Global quest editor: opened from the top bar, command palette, dashboard and quest board. */
export const questEditorStore = createStore<{ open: boolean; quest: Quest | null }>({ open: false, quest: null });
export const openQuestEditor = (quest: Quest | null = null) => questEditorStore.set({ open: true, quest });
export const closeQuestEditor = () => questEditorStore.set({ open: false, quest: null });

export const paletteStore = createStore(false);
