import type { QuestDifficulty, QuestFrequency, QuestKind } from "@shared/types";

export const DIFFICULTY_LABEL: Record<QuestDifficulty, string> = { trivial: "Trivial", easy: "Easy", medium: "Medium", hard: "Hard", epic: "Epic" };
export const FREQUENCY_LABEL: Record<QuestFrequency, string> = { once: "One-time", daily: "Daily", weekly: "Weekly", custom: "Custom days" };
export const KIND_LABEL: Record<QuestKind, string> = { standard: "Standard", milestone: "Milestone", challenge: "Challenge", season: "Season" };
/** Pips give difficulty a monochrome visual weight instead of colour coding. */
export const DIFFICULTY_PIPS: Record<QuestDifficulty, number> = { trivial: 1, easy: 2, medium: 3, hard: 4, epic: 5 };
