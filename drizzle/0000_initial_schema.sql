CREATE TABLE `achievement_unlocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`achievement_id` integer NOT NULL,
	`unlocked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_unlocks_achievement_id_unique` ON `achievement_unlocks` (`achievement_id`);--> statement-breakpoint
CREATE TABLE `achievements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`icon` text DEFAULT 'trophy' NOT NULL,
	`category` text NOT NULL,
	`tier` text DEFAULT 'bronze' NOT NULL,
	`condition_type` text NOT NULL,
	`condition_value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievements_key_unique` ON `achievements` (`key`);--> statement-breakpoint
CREATE TABLE `backup_metadata` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`kind` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`integrity_ok` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_metadata_file_name_unique` ON `backup_metadata` (`file_name`);--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`idempotency_key` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_transactions_idempotency_key_unique` ON `credit_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `credit_transactions_created_idx` ON `credit_transactions` (`created_at`);--> statement-breakpoint
CREATE TABLE `financial_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`is_protected` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financial_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`occurred_on` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `financial_transactions_account_idx` ON `financial_transactions` (`account_id`,`occurred_on`);--> statement-breakpoint
CREATE TABLE `life_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_focus` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `life_categories_key_unique` ON `life_categories` (`key`);--> statement-breakpoint
CREATE TABLE `quest_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`quest_id` integer NOT NULL,
	`category_id` integer,
	`xp_awarded` integer NOT NULL,
	`credits_awarded` integer NOT NULL,
	`evidence_note` text DEFAULT '' NOT NULL,
	`completed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`instance_id`) REFERENCES `quest_instances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `life_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_completions_live_uq` ON `quest_completions` (`instance_id`) WHERE undone_at IS NULL;--> statement-breakpoint
CREATE INDEX `quest_completions_completed_idx` ON `quest_completions` (`completed_at`);--> statement-breakpoint
CREATE TABLE `quest_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quest_id` integer NOT NULL,
	`period_key` text NOT NULL,
	`scheduled_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`status_changed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`quest_id`) REFERENCES `quests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quest_instances_period_uq` ON `quest_instances` (`quest_id`,`period_key`);--> statement-breakpoint
CREATE INDEX `quest_instances_date_idx` ON `quest_instances` (`scheduled_date`);--> statement-breakpoint
CREATE TABLE `quests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` integer,
	`kind` text DEFAULT 'standard' NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`xp_reward` integer NOT NULL,
	`credit_reward` integer NOT NULL,
	`frequency` text NOT NULL,
	`recurrence_days` text DEFAULT '[]' NOT NULL,
	`completion_requirements` text DEFAULT '' NOT NULL,
	`verification` text DEFAULT 'none' NOT NULL,
	`due_date` text,
	`is_optional` integer DEFAULT false NOT NULL,
	`season_id` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `life_categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quests_status_idx` ON `quests` (`status`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_url` text,
	`category` text DEFAULT 'experience' NOT NULL,
	`credit_price` integer NOT NULL,
	`estimated_cost_cents` integer DEFAULT 0 NOT NULL,
	`quantity_available` integer,
	`repeatable` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`is_wishlisted` integer DEFAULT false NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `savings_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`account_id` integer,
	`monthly_contribution_cents` integer,
	`target_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `season_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`title` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `season_goals_season_idx` ON `season_goals` (`season_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`theme` text DEFAULT '' NOT NULL,
	`celebration` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timeline_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`category_id` integer,
	`source_type` text,
	`source_id` integer,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `life_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `timeline_events_occurred_idx` ON `timeline_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `timeline_events_source_idx` ON `timeline_events` (`source_type`,`source_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Africa/Johannesburg' NOT NULL,
	`locale` text DEFAULT 'en-ZA' NOT NULL,
	`currency` text DEFAULT 'ZAR' NOT NULL,
	`rest_days` text DEFAULT '[]' NOT NULL,
	`daily_quest_limit` integer,
	`undo_window_hours` integer DEFAULT 24 NOT NULL,
	`rank_thresholds` text NOT NULL,
	`difficulty_rewards` text NOT NULL,
	`reduced_motion` text DEFAULT 'system' NOT NULL,
	`main_goals` text DEFAULT '[]' NOT NULL,
	`reward_categories` text DEFAULT '[]' NOT NULL,
	`monthly_income_cents` integer,
	`monthly_savings_target_cents` integer,
	`monthly_reward_allowance_cents` integer,
	`ai_enabled` integer DEFAULT false NOT NULL,
	`anthropic_api_key` text,
	`ai_model` text DEFAULT 'claude-sonnet-5-5' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`onboarded_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `xp_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount` integer NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`idempotency_key` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`category_id` integer,
	FOREIGN KEY (`category_id`) REFERENCES `life_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xp_transactions_idempotency_key_unique` ON `xp_transactions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `xp_transactions_created_idx` ON `xp_transactions` (`created_at`);