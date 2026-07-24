CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`status` text NOT NULL,
	`author_name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `decisions_release_idx` ON `decisions` (`release_id`);--> statement-breakpoint
CREATE TABLE `feedback_items` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`page_path` text DEFAULT '/' NOT NULL,
	`viewport` text DEFAULT 'desktop' NOT NULL,
	`position_x` integer,
	`position_y` integer,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_release_idx` ON `feedback_items` (`release_id`);--> statement-breakpoint
CREATE INDEX `feedback_status_idx` ON `feedback_items` (`status`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`accent` text DEFAULT '#ddebec' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`commit_sha` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`share_token` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_share_token_unique` ON `releases` (`share_token`);--> statement-breakpoint
CREATE INDEX `releases_project_idx` ON `releases` (`project_id`);
