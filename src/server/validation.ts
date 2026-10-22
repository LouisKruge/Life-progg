import { z } from "zod";
import { AI_DATA_SCOPES, QUEST_DIFFICULTIES, QUEST_FREQUENCIES, QUEST_KINDS } from "../shared/types.js";
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
  seasonId: z.number().int().positive().nullable().optional(),
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
    emergencyFundMonths: z.number().int().min(1).max(24),
    aiDataScopes: z.array(z.enum(AI_DATA_SCOPES)).max(AI_DATA_SCOPES.length),
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

// ---------- Phase 3 ----------

export const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a month (YYYY-MM).");

export const rewardSchema = z.object({
  name: shortText(80).min(1, "Give the reward a name."),
  description: shortText(1000).optional(),
  imageUrl: z.string().trim().max(2000).refine((v) => v === "" || /^(https?:|data:image\/)/.test(v), "Use an http(s) or data:image URL.").nullable().optional(),
  category: shortText(40).min(1).optional(),
  creditPrice: z.number().int().min(1).max(100_000),
  estimatedCostCents: cents.optional(),
  quantityAvailable: z.number().int().min(0).max(10_000).nullable().optional(),
  repeatable: z.boolean().optional(),
  isWishlisted: z.boolean().optional(),
});
export const rewardPatchSchema = rewardSchema.partial().extend({ status: z.enum(["active", "archived"]).optional() });
export const reorderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });
export const redeemSchema = z.object({ requestId: z.string().min(8).max(100), note: shortText(500).optional() });
export const confirmSpendingSchema = z.object({ actualCostCents: cents.optional(), accountId: z.number().int().positive().nullable().optional() });

const accountType = z.enum(["savings", "emergency", "cheque", "investment", "cash"]);
export const accountSchema = z.object({ name: shortText(60).min(1), type: accountType, openingBalanceCents: signedCents.optional() });
export const accountPatchSchema = z.object({ name: shortText(60).min(1).optional(), archived: z.boolean().optional() });

export const transactionSchema = z.object({
  accountId: z.number().int().positive(),
  amountCents: cents.positive("Enter an amount above zero."),
  kind: z.enum(["deposit", "withdrawal", "income", "expense"]),
  category: shortText(40).optional(),
  description: shortText(200).optional(),
  occurredOn: dateString.optional(),
  status: z.enum(["confirmed", "pending"]).optional(),
});
export const confirmTransactionSchema = z.object({ amountCents: cents.positive().optional(), occurredOn: dateString.optional() }).optional().default({});

export const recurringSchema = z.object({
  accountId: z.number().int().positive(),
  name: shortText(80).min(1),
  amountCents: cents.positive(),
  kind: z.enum(["income", "expense", "deposit", "withdrawal"]),
  category: shortText(40).optional(),
  dayOfMonth: z.number().int().min(1).max(28),
});
export const recurringPatchSchema = recurringSchema.partial().extend({ active: z.boolean().optional() });

export const budgetSchema = z.object({ month: monthString, category: shortText(40).min(1), limitCents: cents.nullable() });

export const debtSchema = z.object({
  name: shortText(80).min(1),
  kind: shortText(40).optional(),
  startingBalanceCents: cents.positive(),
  interestRateBps: z.number().int().min(0).max(10_000).optional(),
  minimumPaymentCents: cents.optional(),
});
export const debtPatchSchema = debtSchema.omit({ startingBalanceCents: true }).partial().extend({ archived: z.boolean().optional() });
export const debtPaymentSchema = z.object({ amountCents: cents.positive(), paidOn: dateString.optional(), note: shortText(200).optional(), fromAccountId: z.number().int().positive().nullable().optional() });

export const scenarioSchema = z.object({ monthlySavingsCents: cents, extraDebtPaymentCents: cents.optional(), months: z.number().int().min(1).max(120).optional() });

// ---------- Phase 4 ----------

const achievementCategory = z.enum(["wealth", "fitness", "discipline", "business", "learning", "personal", "milestone"]);
export const customAchievementSchema = z.object({
  name: shortText(80).min(1),
  description: shortText(300).min(1),
  category: achievementCategory,
  tier: z.enum(["bronze", "silver", "gold", "platinum"]),
  icon: shortText(40).optional(),
});
export const unlockSchema = z.object({ evidence: shortText(2000).optional().default("") });

const goalInput = z.object({ title: shortText(160).min(1), isPrimary: z.boolean().optional() });
export const seasonSchema = z.object({
  name: shortText(80).min(1),
  startDate: dateString,
  endDate: dateString.optional(),
  theme: shortText(300).optional(),
  celebration: shortText(300).optional(),
  goals: z.array(goalInput).max(12).optional(),
  activate: z.boolean().optional(),
});
export const seasonPatchSchema = seasonSchema.omit({ goals: true, activate: true }).partial();
export const seasonGoalSchema = goalInput;
export const seasonGoalPatchSchema = goalInput.partial().extend({ status: z.enum(["open", "achieved", "dropped"]).optional() });
export const reviewSchema = z.object({
  weekOf: dateString.optional(),
  wins: shortText(4000).optional(),
  challenges: shortText(4000).optional(),
  nextFocus: shortText(4000).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
});

export const noteSchema = z.object({
  title: shortText(160).min(1),
  detail: shortText(4000).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  kind: z.enum(["note", "event"]).optional(),
});
export const snapshotSchema = z.object({ label: shortText(120).optional() }).optional().default({});

// ---------- Phase 5 ----------

export const aiMessageSchema = z.object({
  conversationId: z.number().int().positive().optional(),
  text: z.string().trim().min(1, "Write a message.").max(8000),
  mode: z.enum(["chat", "daily_focus", "weekly_review"]).optional(),
});
export const proposalDecisionSchema = z.object({ approve: z.boolean() });

export const icsPreviewSchema = z.object({ ics: z.string().min(1).max(2_000_000), days: z.number().int().min(1).max(365).optional() });
export const icsImportSchema = z.object({
  events: z.array(z.object({ title: shortText(120).min(1), date: dateString, time: z.string().regex(/^\d{2}:\d{2}$/).nullable() })).min(1).max(200),
});
