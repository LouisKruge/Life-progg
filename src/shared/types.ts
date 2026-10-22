// Types and pure helpers shared by the API server and the web client.
// Money is always integer cents. Calendar dates are YYYY-MM-DD in the user's timezone.

export type QuestFrequency = "once" | "daily" | "weekly" | "custom";
export type QuestKind = "standard" | "milestone" | "challenge" | "season";
export type QuestDifficulty = "trivial" | "easy" | "medium" | "hard" | "epic";
export type QuestVerification = "none" | "note" | "confirm";
export type ReducedMotionPreference = "system" | "reduce" | "full";

export const QUEST_DIFFICULTIES: QuestDifficulty[] = ["trivial", "easy", "medium", "hard", "epic"];
export const QUEST_FREQUENCIES: QuestFrequency[] = ["once", "daily", "weekly", "custom"];
export const QUEST_KINDS: QuestKind[] = ["standard", "milestone", "challenge", "season"];

export type DifficultyRewards = Record<QuestDifficulty, { xp: number; credits: number }>;

export interface RankThreshold {
  title: string;
  minLevel: number;
}

export interface LevelInfo {
  level: number;
  totalXp: number;
  /** XP earned inside the current level. */
  xpIntoLevel: number;
  /** XP needed to go from the current level to the next one. */
  xpForNextLevel: number;
  /** Cumulative XP at which the current level started. */
  levelStartXp: number;
}

export interface Settings {
  displayName: string;
  onboarded: boolean;
  timezone: string;
  locale: string;
  currency: string;
  restDays: number[];
  dailyQuestLimit: number | null;
  undoWindowHours: number;
  rankThresholds: RankThreshold[];
  difficultyRewards: DifficultyRewards;
  reducedMotion: ReducedMotionPreference;
  mainGoals: string[];
  rewardCategories: string[];
  monthlyIncomeCents: number | null;
  monthlySavingsTargetCents: number | null;
  monthlyRewardAllowanceCents: number | null;
  aiEnabled: boolean;
  /** Whether a Claude API key is stored on the server. The key itself is never sent to the browser. */
  hasApiKey: boolean;
  aiModel: string;
  emergencyFundMonths: number;
  aiDataScopes: AiDataScope[];
}

export type AiDataScope = "quests" | "progression" | "finances" | "rewards" | "seasons" | "journal";
export const AI_DATA_SCOPES: AiDataScope[] = ["quests", "progression", "finances", "rewards", "seasons", "journal"];

export interface LifeCategory {
  id: number;
  key: string;
  name: string;
  description: string;
  isFocus: boolean;
}

export interface Quest {
  id: number;
  title: string;
  description: string;
  categoryId: number | null;
  kind: QuestKind;
  difficulty: QuestDifficulty;
  xpReward: number;
  creditReward: number;
  frequency: QuestFrequency;
  recurrenceDays: number[];
  completionRequirements: string;
  verification: QuestVerification;
  dueDate: string | null;
  isOptional: boolean;
  status: "active" | "archived";
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type InstanceStatus = "pending" | "completed" | "skipped";

export interface QuestInstanceView {
  instanceId: number;
  periodKey: string;
  scheduledDate: string;
  status: InstanceStatus;
  quest: Quest;
  completion: {
    id: number;
    completedAt: string;
    xpAwarded: number;
    creditsAwarded: number;
    evidenceNote: string;
    /** Undo is allowed until this ISO timestamp. */
    undoableUntil: string;
  } | null;
}

export interface Character {
  displayName: string;
  rank: string;
  nextRank: { title: string; minLevel: number } | null;
  credits: number;
  level: LevelInfo;
  categories: Array<LifeCategory & { xp: number; level: number }>;
  stats: { questsCompleted: number; activeDays: number; lifetimeCreditsEarned: number };
}

export interface ProgressionDelta {
  xpGained: number;
  creditsGained: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
}

export interface CompletionResponse {
  instance: QuestInstanceView;
  /** True when the instance was already completed: nothing was paid out again. */
  alreadyCompleted: boolean;
  delta: ProgressionDelta;
  character: Character;
}

export interface SavingsGoalView {
  id: number;
  name: string;
  targetCents: number;
  /** Confirmed balance of the linked account. */
  savedCents: number;
  monthlyContributionCents: number | null;
  targetDate: string | null;
  /** Projected completion month based on the planned monthly contribution. A projection, not a fact. */
  projectedCompletion: string | null;
  accountId: number | null;
}

export interface TimelineEvent {
  id: number;
  type: string;
  title: string;
  detail: string;
  occurredAt: string;
}

export interface DashboardData {
  today: string;
  isRestDay: boolean;
  character: Character;
  quests: QuestInstanceView[];
  completion: { done: number; total: number; percent: number };
  workload: { activeDailyQuests: number; limit: number | null; overLimit: boolean };
  weeklyActivity: Array<{ date: string; completed: number; xp: number }>;
  savingsGoal: SavingsGoalView | null;
  season: { id: number; name: string; startDate: string; endDate: string; dayNumber: number; totalDays: number } | null;
  recentAchievements: Array<{ id: number; name: string; tier: string; unlockedAt: string }>;
  nextReward: { id: number; name: string; creditPrice: number; creditsNeeded: number } | null;
  milestones: Array<{ label: string; detail: string; progress: number }>;
  focus: { source: "planner" | "ai"; headline: string; points: string[] };
  recentEvents: TimelineEvent[];
}

export interface BackupInfo {
  id: number;
  fileName: string;
  kind: "manual" | "pre-migration" | "pre-restore";
  sizeBytes: number;
  integrityOk: boolean;
  createdAt: string;
}

// ---------- Phase 3: rewards & wealth ----------

export interface RewardView {
  id: number;
  name: string;
  description: string;
  imageUrl: string | null;
  category: string;
  creditPrice: number;
  estimatedCostCents: number;
  quantityAvailable: number | null;
  repeatable: boolean;
  status: "active" | "archived";
  isWishlisted: boolean;
  isDemo: boolean;
  sortOrder: number;
  timesRedeemed: number;
  /** Why it can't be redeemed right now, or null if it can. */
  blockedReason: string | null;
}

export interface RedemptionView {
  id: number;
  rewardId: number;
  rewardName: string;
  creditCost: number;
  reservedCents: number;
  actualCostCents: number | null;
  status: "reserved" | "fulfilled" | "cancelled";
  note: string;
  redeemedAt: string;
  fulfilledAt: string | null;
  cancelledAt: string | null;
}

export interface RewardBudget {
  month: string;
  allowanceCents: number;
  reservedCents: number;
  spentCents: number;
  availableCents: number;
}

export interface VaultData {
  credits: number;
  budget: RewardBudget;
  rewards: RewardView[];
  redemptions: RedemptionView[];
}

export type AccountType = "savings" | "emergency" | "cheque" | "investment" | "cash";
export type TransactionKind = "opening_balance" | "deposit" | "withdrawal" | "income" | "expense" | "correction";

export interface AccountView {
  id: number;
  name: string;
  type: AccountType;
  isProtected: boolean;
  balanceCents: number;
  pendingCents: number;
  archived: boolean;
}

export interface TransactionView {
  id: number;
  accountId: number;
  accountName: string;
  amountCents: number;
  kind: TransactionKind;
  category: string;
  description: string;
  occurredOn: string;
  status: "confirmed" | "pending";
  recurringId: number | null;
}

export interface RecurringView {
  id: number;
  accountId: number;
  name: string;
  amountCents: number;
  kind: "income" | "expense" | "deposit" | "withdrawal";
  category: string;
  dayOfMonth: number;
  active: boolean;
}

export interface DebtView {
  id: number;
  name: string;
  kind: string;
  startingBalanceCents: number;
  balanceCents: number;
  interestRateBps: number;
  minimumPaymentCents: number;
  status: "active" | "paid_off" | "archived";
  /** Estimate at the minimum payment; null if the payment doesn't cover interest. */
  payoff: { months: number; totalInterestCents: number; month: string } | null;
}

export interface BudgetLine {
  category: string;
  limitCents: number | null;
  spentCents: number;
  plannedCents: number;
}

export interface MonthSummary {
  month: string;
  incomeCents: number;
  expensesCents: number;
  savedCents: number;
  pendingIncomeCents: number;
  pendingExpensesCents: number;
  budget: BudgetLine[];
}

export interface ProjectionPoint {
  month: string;
  savingsCents: number;
  netCents: number;
}

export interface WealthOverview {
  month: string;
  accounts: AccountView[];
  netWorthCents: number;
  totalDebtCents: number;
  summary: MonthSummary;
  emergencyFund: { balanceCents: number; targetCents: number; months: number; monthlyExpensesCents: number };
  savingsGoals: SavingsGoalView[];
  debts: DebtView[];
  recurring: RecurringView[];
  /** Labelled projections, never mixed with actual balances. */
  projection: ProjectionPoint[];
  plan: { monthlyIncomeCents: number | null; monthlySavingsTargetCents: number | null };
}

export interface ScenarioResult {
  goals: Array<{ id: number; name: string; months: number | null; month: string | null }>;
  debts: Array<{ id: number; name: string; months: number | null; month: string | null; totalInterestCents: number | null }>;
  series: ProjectionPoint[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ---------- Progression maths (shared so the UI and server always agree) ----------

/** XP required to advance from level L to L+1: 500 + 150(L-1) + 25(L-1)^2. */
export function xpToAdvance(level: number): number {
  const n = level - 1;
  return 500 + 150 * n + 25 * n * n;
}

/** Cumulative XP at which `level` is reached (level 1 starts at 0). */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToAdvance(l);
  return total;
}

export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let start = 0;
  while (xp >= start + xpToAdvance(level)) {
    start += xpToAdvance(level);
    level += 1;
  }
  return { level, totalXp: xp, levelStartXp: start, xpIntoLevel: xp - start, xpForNextLevel: xpToAdvance(level) };
}

export const DEFAULT_RANKS: RankThreshold[] = [
  { title: "Initiate", minLevel: 1 },
  { title: "Apprentice", minLevel: 5 },
  { title: "Builder", minLevel: 10 },
  { title: "Architect", minLevel: 20 },
  { title: "Strategist", minLevel: 30 },
  { title: "Master", minLevel: 45 },
  { title: "Legend", minLevel: 60 },
];

export const DEFAULT_DIFFICULTY_REWARDS: DifficultyRewards = {
  trivial: { xp: 25, credits: 2 },
  easy: { xp: 50, credits: 5 },
  medium: { xp: 100, credits: 10 },
  hard: { xp: 200, credits: 20 },
  epic: { xp: 400, credits: 40 },
};

export function rankForLevel(level: number, ranks: RankThreshold[]): { current: string; next: RankThreshold | null } {
  const sorted = [...ranks].sort((a, b) => a.minLevel - b.minLevel);
  let current = sorted[0]?.title ?? "Initiate";
  let next: RankThreshold | null = null;
  for (const r of sorted) {
    if (level >= r.minLevel) current = r.title;
    else {
      next = r;
      break;
    }
  }
  return { current, next };
}
