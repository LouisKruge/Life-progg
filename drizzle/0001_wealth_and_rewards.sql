CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`category` text NOT NULL,
	`limit_cents` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_month_category_uq` ON `budgets` (`month`,`category`);--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_on` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `debt_payments_debt_idx` ON `debt_payments` (`debt_id`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'loan' NOT NULL,
	`starting_balance_cents` integer NOT NULL,
	`interest_rate_bps` integer DEFAULT 0 NOT NULL,
	`minimum_payment_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`paid_off_at` text
);
--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`day_of_month` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `financial_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `reward_budget_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`allowance_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_budget_periods_month_unique` ON `reward_budget_periods` (`month`);--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reward_id` integer NOT NULL,
	`reward_name` text NOT NULL,
	`credit_cost` integer NOT NULL,
	`reserved_cents` integer DEFAULT 0 NOT NULL,
	`actual_cost_cents` integer,
	`budget_period_id` integer,
	`status` text DEFAULT 'reserved' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`idempotency_key` text NOT NULL,
	`redeemed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`fulfilled_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`budget_period_id`) REFERENCES `reward_budget_periods`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_redemptions_idempotency_key_unique` ON `reward_redemptions` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_reward_idx` ON `reward_redemptions` (`reward_id`);--> statement-breakpoint
CREATE INDEX `reward_redemptions_period_idx` ON `reward_redemptions` (`budget_period_id`);--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD `recurring_id` integer;--> statement-breakpoint
ALTER TABLE `financial_transactions` ADD `recurring_period` text;--> statement-breakpoint
CREATE UNIQUE INDEX `financial_transactions_recurring_uq` ON `financial_transactions` (`recurring_id`,`recurring_period`) WHERE recurring_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `emergency_fund_months` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ai_data_scopes` text DEFAULT '["quests","progression","seasons"]' NOT NULL;