import { z } from "zod";
import { QUEST_DIFFICULTIES, QUEST_FREQUENCIES, QUEST_KINDS } from "../shared/types.js";
import { isValidDate } from "./domain/dates.js";

const MAX_CENTS = 100_000_000_000; // R1 billion: generous, but rejects typos like extra zeros on overflow.

export const dateString = z.string().refine(isValidDate, "Expected a valid date (YYYY-MM-DD).");
export const cents = z.number().int().min(0).max(MAX_CENTS);
export const signedCents = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);
const shortText = (max: number) => z.string().trim().max(max);
const weekdays = z.array(z.number().int().min(0).max(6)).max(7);

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const questCreateSchema = z.object({
  title: shortText(120).min(1, "Give the quest a title."),
  description: shortText(2000).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  kind: z.enum(QUEST_KINDS).optional(),
  difficulty: z.enum(QUEST_DIFFICULTIES),
  xpReward: z.number().int().min(0).max(10_000).optional(),
  creditReward: z.number().int().min(0).max(1_000).optional(),
  frequency: z.enum(QUEST_FREQUENCIES),
  recurrenceDays: weekdays.optional(),
  completionRequirements: shortText(1000).optional(),
  verification: z.enum(["none", "note", "confirm"]).optional(),
  dueDate: dateString.nullable().optional(),
  isOptional: z.boolean().optional(),
});

export const questUpdateSchema = questCreateSchema.partial();

export const completeSchema = z
  .object({ evidenceNote: shortText(2000).optional(), confirmed: z.boolean().optional() })
  .optional()
  .default({});

export const skipSchema = z.object({ skipped: z.boolean() });
export const archiveSchema = z.object({ archived: z.boolean() });
export const rescheduleSchema = z.object({ dueDate: dateString });

const rankSchema = z.object({ title: shortText(40).min(1), minLevel: z.number().int().min(1).max(1000) });
const rewardPair = z.object({ xp: z.number().int().min(0).max(10_000), credits: z.number().int().min(0).max(1_000) });

export const settingsPatchSchema = z
  .object({
    displayName: shortText(60).min(1),
    timezone: shortText(64).min(1),
    locale: shortText(20).min(2),
    currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, e.g. ZAR."),
    restDays: weekdays,
    dailyQuestLimit: z.number().int().min(1).max(50).nullable(),
    undoWindowHours: z.number().int().min(0).max(168),
    rankThresholds: z.array(rankSchema).min(1).max(20),
    difficultyRewards: z.object({ trivial: rewardPair, easy: rewardPair, medium: rewardPair, hard: rewardPair, epic: rewardPair }),
    reducedMotion: z.enum(["system", "reduce", "full"]),
    mainGoals: z.array(shortText(200).min(1)).max(10),
    rewardCategories: z.array(shortText(40).min(1)).max(20),
    monthlyIncomeCents: cents.nullable(),
    monthlySavingsTargetCents: cents.nullable(),
    monthlyRewardAllowanceCents: cents.nullable(),
    aiEnabled: z.boolean(),
    aiModel: shortText(80).min(1),
    anthropicApiKey: shortText(300).min(10).nullable(),
  })
  .partial();

export const onboardingSchema = z.object({
  displayName: shortText(60).optional(),
  mainGoals: z.array(shortText(200).min(1)).max(10).optional(),
  focusCategories: z.array(z.enum(["wealth", "physique", "mind", "empire", "life", "discipline"])).optional(),
  dailyQuestLimit: z.number().int().min(1).max(50).nullable().optional(),
  rewardCategories: z.array(shortText(40).min(1)).max(20).optional(),
  monthlyRewardAllowanceCents: cents.nullable().optional(),
  finances: z
    .object({
      monthlyIncomeCents: cents.nullable().optional(),
      startingSavingsCents: cents.nullable().optional(),
      monthlySavingsTargetCents: cents.nullable().optional(),
      firstMilestoneCents: cents.positive().nullable().optional(),
      longTermMilestoneCents: cents.positive().nullable().optional(),
    })
    .optional(),
  anthropicApiKey: shortText(300).nullable().optional(),
  loadDemoData: z.boolean().optional(),
});

export const savingsEntrySchema = z.object({
  amountCents: signedCents.refine((v) => v !== 0, "Enter an amount other than zero."),
  description: shortText(200).optional(),
  occurredOn: dateString.optional(),
});

export const savingsGoalSchema = z.object({
  name: shortText(80).min(1),
  targetCents: cents.positive(),
  monthlyContributionCents: cents.nullable().optional(),
  targetDate: dateString.nullable().optional(),
  startingBalanceCents: cents.optional(),
});

export const restoreSchema = z.object({ fileName: z.string().min(1).max(200) });
