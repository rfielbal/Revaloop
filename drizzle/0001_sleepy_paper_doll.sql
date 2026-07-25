CREATE TABLE `app_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email_unique` ON `app_users` (`email`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`release_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_org_created_idx` ON `audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_release_idx` ON `audit_events` (`release_id`);--> statement-breakpoint
CREATE TABLE `client_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`accent` text DEFAULT '#ddebec' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_projects_org_slug_unique` ON `client_projects` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `client_projects_org_idx` ON `client_projects` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'developer' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_members_org_user_unique` ON `organization_members` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `organization_members_user_idx` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`reviewer_session_id` text NOT NULL,
	`status` text NOT NULL,
	`author_name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_session_id`) REFERENCES `reviewer_sessions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_decisions_release_unique` ON `review_decisions` (`release_id`);--> statement-breakpoint
CREATE INDEX `review_decisions_session_idx` ON `review_decisions` (`reviewer_session_id`);--> statement-breakpoint
CREATE TABLE `review_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`author_session_id` text,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`page_path` text DEFAULT '/' NOT NULL,
	`page_title` text DEFAULT '' NOT NULL,
	`viewport` text DEFAULT 'desktop' NOT NULL,
	`position_x` integer,
	`position_y` integer,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_session_id`) REFERENCES `reviewer_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_feedback_release_sequence_unique` ON `review_feedback` (`release_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `review_feedback_release_idx` ON `review_feedback` (`release_id`);--> statement-breakpoint
CREATE INDEX `review_feedback_status_idx` ON `review_feedback` (`status`);--> statement-breakpoint
CREATE TABLE `review_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`reviewer_name` text NOT NULL,
	`reviewer_email` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_invitations_token_hash_unique` ON `review_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `review_invitations_release_idx` ON `review_invitations` (`release_id`);--> statement-breakpoint
CREATE INDEX `review_invitations_token_idx` ON `review_invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `review_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`commit_sha` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'in_review' NOT NULL,
	`preview_kind` text DEFAULT 'external' NOT NULL,
	`preview_url` text NOT NULL,
	`reviewer_message` text DEFAULT '' NOT NULL,
	`feedback_sequence` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `review_releases_project_idx` ON `review_releases` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_releases_project_version_unique` ON `review_releases` (`project_id`,`version`);--> statement-breakpoint
CREATE TABLE `review_test_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`test_item_id` text NOT NULL,
	`completed_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `reviewer_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_item_id`) REFERENCES `review_test_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_test_completions_session_item_unique` ON `review_test_completions` (`session_id`,`test_item_id`);--> statement-breakpoint
CREATE TABLE `review_test_items` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_test_items_release_position_unique` ON `review_test_items` (`release_id`,`position`);--> statement-breakpoint
CREATE INDEX `review_test_items_release_idx` ON `review_test_items` (`release_id`);--> statement-breakpoint
CREATE TABLE `reviewer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`release_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`reviewer_name` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`invitation_id`) REFERENCES `review_invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviewer_sessions_token_hash_unique` ON `reviewer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `reviewer_sessions_release_idx` ON `reviewer_sessions` (`release_id`);--> statement-breakpoint
CREATE INDEX `reviewer_sessions_invitation_idx` ON `reviewer_sessions` (`invitation_id`);