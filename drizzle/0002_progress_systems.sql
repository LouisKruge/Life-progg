CREATE TABLE `season_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`wins` text DEFAULT '' NOT NULL,
	`challenges` text DEFAULT '' NOT NULL,
	`next_focus` text DEFAULT '' NOT NULL,
	`rating` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `season_reviews_week_uq` ON `season_reviews` (`season_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `skill_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tree` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`parent_keys` text DEFAULT '[]' NOT NULL,
	`condition_type` text NOT NULL,
	`condition_value` integer NOT NULL,
	`condition_key` text,
	`x` integer NOT NULL,
	`y` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_nodes_key_unique` ON `skill_nodes` (`key`);--> statement-breakpoint
CREATE INDEX `skill_nodes_tree_idx` ON `skill_nodes` (`tree`);--> statement-breakpoint
CREATE TABLE `skill_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`unlocked_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`seen_at` text,
	FOREIGN KEY (`node_id`) REFERENCES `skill_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_progress_node_id_unique` ON `skill_progress` (`node_id`);--> statement-breakpoint
ALTER TABLE `achievement_unlocks` ADD `seen_at` text;--> statement-breakpoint
ALTER TABLE `achievements` ADD `condition_key` text;--> statement-breakpoint
ALTER TABLE `achievements` ADD `is_custom` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `achievements` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `seasons` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `seasons` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `seasons` ADD `status_before_archive` text;--> statement-breakpoint
ALTER TABLE `timeline_events` ADD `data` text;