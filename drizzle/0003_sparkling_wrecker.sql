CREATE TABLE `developer_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `developer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `developer_sessions_token_hash_unique` ON `developer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `developer_sessions_user_idx` ON `developer_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `developer_sessions_expires_idx` ON `developer_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `release_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`author_type` text NOT NULL,
	`author_user_id` text,
	`author_session_id` text,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_session_id`) REFERENCES `reviewer_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `release_messages_release_created_idx` ON `release_messages` (`release_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `release_messages_author_user_idx` ON `release_messages` (`author_user_id`);--> statement-breakpoint
CREATE INDEX `release_messages_author_session_idx` ON `release_messages` (`author_session_id`);--> statement-breakpoint
ALTER TABLE `review_releases` ADD `preview_revision` integer DEFAULT 0 NOT NULL;