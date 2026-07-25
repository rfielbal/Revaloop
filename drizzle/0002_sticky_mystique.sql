PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`reviewer_session_id` text,
	`status` text NOT NULL,
	`author_name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `review_releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_session_id`) REFERENCES `reviewer_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_review_decisions`("id", "release_id", "reviewer_session_id", "status", "author_name", "note", "created_at") SELECT "id", "release_id", "reviewer_session_id", "status", "author_name", "note", "created_at" FROM `review_decisions`;--> statement-breakpoint
DROP TABLE `review_decisions`;--> statement-breakpoint
ALTER TABLE `__new_review_decisions` RENAME TO `review_decisions`;--> statement-breakpoint
CREATE UNIQUE INDEX `review_decisions_release_unique` ON `review_decisions` (`release_id`);--> statement-breakpoint
CREATE INDEX `review_decisions_session_idx` ON `review_decisions` (`reviewer_session_id`);
