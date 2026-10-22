import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type {
  DifficultyRewards,
  QuestDifficulty,
  QuestFrequency,
  QuestKind,
  QuestVerification,
  RankThreshold,
  ReducedMotionPreference,
} from "../../shared/types.js";

// Conventions:
// - Money is integer cents (ZAR by default). Never floats.
// - Timestamps are ISO-8601 UTC strings; calendar dates are YYYY-MM-DD in the user's timezone.
// - LEVEL ONE is single-user and local-first: domain tables are not partitioned by user.

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text("created_at").notNull().default(now);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  displayName: text("display_name").notNull(),
  onboardedAt: text("onboarded_at"),
  createdAt: createdAt(),
});

export const userSettings = sqliteTable("user_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  locale: text("locale").notNull().default("en-ZA"),
  currency: text("currency").notNull().default("ZAR"),
  /** Weekdays (0 = Sunday) on which daily quests are not generated. */
  restDays: text("rest_days", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
  dailyQuestLimit: integer("daily_quest_limit"),
  undoWindowHours: integer("undo_window_hours").notNull().default(24),
  rankThresholds: text("rank_thresholds", { mode: "json" }).$type<RankThreshold[]>().notNull(),
  difficultyRewards: text("difficulty_rewards", { mode: "json" }).$type<DifficultyRewards>().notNull(),
  reducedMotion: text("reduced_motion").$type<ReducedMotionPreference>().notNull().default("system"),
  mainGoals: text("main_goals", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  rewardCategories: text("reward_categories", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  monthlyIncomeCents: integer("monthly_income_cents"),
  monthlySavingsTargetCents: integer("monthly_savings_target_cents"),
  monthlyRewardAllowanceCents: integer("monthly_reward_allowance_cents"),
  aiEnabled: integer("ai_enabled", { mode: "boolean" }).notNull().default(false),
  /** Stored server-side only; never returned to the browser. */
  anthropicApiKey: text("anthropic_api_key"),
  aiModel: text("ai_model").notNull().default("claude-sonnet-5-5"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const lifeCategories = sqliteTable("life_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isFocus: integer("is_focus", { mode: "boolean" }).notNull().default(false),
});

export const seasons = sqliteTable("seasons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").$type<"planned" | "active" | "completed" | "archived">().notNull().default("planned"),
  theme: text("theme").notNull().default(""),
  celebration: text("celebration").notNull().default(""),
  createdAt: createdAt(),
});

export const seasonGoals = sqliteTable(
  "season_goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    status: text("status").$type<"open" | "achieved" | "dropped">().notNull().default("open"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("season_goals_season_idx").on(t.seasonId)],
);

export const quests = sqliteTable(
  "quests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    categoryId: integer("category_id").references(() => lifeCategories.id, { onDelete: "set null" }),
    kind: text("kind").$type<QuestKind>().notNull().default("standard"),
    difficulty: text("difficulty").$type<QuestDifficulty>().notNull().default("medium"),
    xpReward: integer("xp_reward").notNull(),
    creditReward: integer("credit_reward").notNull(),
    frequency: text("frequency").$type<QuestFrequency>().notNull(),
    /** For frequency = "custom": weekdays (0 = Sunday) the quest recurs on. */
    recurrenceDays: text("recurrence_days", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
    completionRequirements: text("completion_requirements").notNull().default(""),
    verification: text("verification").$type<QuestVerification>().notNull().default("none"),
    dueDate: text("due_date"),
    isOptional: integer("is_optional", { mode: "boolean" }).notNull().default(false),
    seasonId: integer("season_id").references(() => seasons.id, { onDelete: "set null" }),
    status: text("status").$type<"active" | "archived">().notNull().default("active"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().default(now),
    archivedAt: text("archived_at"),
  },
  (t) => [index("quests_status_idx").on(t.status)],
);

/** One concrete occurrence of a quest: a day for daily quests, an ISO week for weekly, a single instance for one-time quests. */
export const questInstances = sqliteTable(
  "quest_instances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questId: integer("quest_id")
      .notNull()
      .references(() => quests.id, { onDelete: "restrict" }),
    periodKey: text("period_key").notNull(),
    scheduledDate: text("scheduled_date").notNull(),
    status: text("status").$type<"pending" | "completed" | "skipped">().notNull().default("pending"),
    statusChangedAt: text("status_changed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("quest_instances_period_uq").on(t.questId, t.periodKey),
    index("quest_instances_date_idx").on(t.scheduledDate),
  ],
);

export const questCompletions = sqliteTable(
  "quest_completions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => questInstances.id, { onDelete: "restrict" }),
    questId: integer("quest_id")
      .notNull()
      .references(() => quests.id, { onDelete: "restrict" }),
    categoryId: integer("category_id").references(() => lifeCategories.id, { onDelete: "set null" }),
    xpAwarded: integer("xp_awarded").notNull(),
    creditsAwarded: integer("credits_awarded").notNull(),
    evidenceNote: text("evidence_note").notNull().default(""),
    completedAt: text("completed_at").notNull().default(now),
    undoneAt: text("undone_at"),
  },
  (t) => [
    // At most one live (not undone) completion per instance: the database itself blocks double payouts.
    uniqueIndex("quest_completions_live_uq").on(t.instanceId).where(sql`undone_at IS NULL`),
    index("quest_completions_completed_idx").on(t.completedAt),
  ],
);

const ledgerColumns = () => ({
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: integer("amount").notNull(),
  sourceType: text("source_type").$type<"quest_completion" | "quest_undo" | "adjustment" | "redemption" | "refund">().notNull(),
  sourceId: integer("source_id"),
  /** Unique per logical event, so retries can never pay out twice. */
  idempotencyKey: text("idempotency_key").notNull().unique(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const xpTransactions = sqliteTable(
  "xp_transactions",
  {
    ...ledgerColumns(),
    categoryId: integer("category_id").references(() => lifeCategories.id, { onDelete: "set null" }),
  },
  (t) => [index("xp_transactions_created_idx").on(t.createdAt)],
);

export const creditTransactions = sqliteTable(
  "credit_transactions",
  ledgerColumns(),
  (t) => [index("credit_transactions_created_idx").on(t.createdAt)],
);

export const rewards = sqliteTable("rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  category: text("category").notNull().default("experience"),
  creditPrice: integer("credit_price").notNull(),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
  quantityAvailable: integer("quantity_available"),
  repeatable: integer("repeatable", { mode: "boolean" }).notNull().default(true),
  status: text("status").$type<"active" | "archived">().notNull().default("active"),
  isWishlisted: integer("is_wishlisted", { mode: "boolean" }).notNull().default(false),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(now),
});

export const achievements = sqliteTable("achievements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("trophy"),
  category: text("category").notNull(),
  tier: text("tier").$type<"bronze" | "silver" | "gold" | "platinum">().notNull().default("bronze"),
  conditionType: text("condition_type").notNull(),
  conditionValue: integer("condition_value").notNull().default(0),
});

export const achievementUnlocks = sqliteTable("achievement_unlocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  achievementId: integer("achievement_id")
    .notNull()
    .unique()
    .references(() => achievements.id, { onDelete: "restrict" }),
  unlockedAt: text("unlocked_at").notNull().default(now),
  evidence: text("evidence").notNull().default(""),
});

export const financialAccounts = sqliteTable("financial_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").$type<"savings" | "emergency" | "cheque" | "investment" | "cash">().notNull(),
  /** Protected accounts (savings, emergency) can never fund rewards. */
  isProtected: integer("is_protected", { mode: "boolean" }).notNull().default(false),
  archivedAt: text("archived_at"),
  createdAt: createdAt(),
});

export const financialTransactions = sqliteTable(
  "financial_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    kind: text("kind").$type<"opening_balance" | "deposit" | "withdrawal" | "income" | "expense" | "correction">().notNull(),
    category: text("category").notNull().default(""),
    description: text("description").notNull().default(""),
    occurredOn: text("occurred_on").notNull(),
    /** Only confirmed transactions count toward actual balances; pending ones are projections. */
    status: text("status").$type<"confirmed" | "pending">().notNull().default("confirmed"),
    createdAt: createdAt(),
  },
  (t) => [index("financial_transactions_account_idx").on(t.accountId, t.occurredOn)],
);

export const savingsGoals = sqliteTable("savings_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  accountId: integer("account_id").references(() => financialAccounts.id, { onDelete: "set null" }),
  monthlyContributionCents: integer("monthly_contribution_cents"),
  targetDate: text("target_date"),
  status: text("status").$type<"active" | "achieved" | "archived">().notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const timelineEvents = sqliteTable(
  "timeline_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    categoryId: integer("category_id").references(() => lifeCategories.id, { onDelete: "set null" }),
    sourceType: text("source_type"),
    sourceId: integer("source_id"),
    occurredAt: text("occurred_at").notNull().default(now),
  },
  (t) => [index("timeline_events_occurred_idx").on(t.occurredAt), index("timeline_events_source_idx").on(t.sourceType, t.sourceId)],
);

export const backupMetadata = sqliteTable("backup_metadata", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull().unique(),
  kind: text("kind").$type<"manual" | "pre-migration" | "pre-restore">().notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  integrityOk: integer("integrity_ok", { mode: "boolean" }).notNull(),
  createdAt: createdAt(),
});
