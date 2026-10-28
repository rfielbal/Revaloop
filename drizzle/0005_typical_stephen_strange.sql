CREATE TABLE `integration_command_receipts` (
	`project_id` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`execution_id` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `request_id`),
	FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integration_instance` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_instance_id_unique` ON `integration_instance` (`id`);--> statement-breakpoint
CREATE TABLE `integration_project_revisions` (
	`project_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integration_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`label` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `client_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_tokens_token_hash_unique` ON `integration_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `integration_tokens_project_idx` ON `integration_tokens` (`project_id`,`created_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO integration_project_revisions(project_id, revision) SELECT id, 0 FROM client_projects;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_project_insert AFTER INSERT ON client_projects BEGIN
    INSERT OR IGNORE INTO integration_project_revisions(project_id, revision) VALUES (NEW.id, 0); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_project_update AFTER UPDATE ON client_projects BEGIN
    UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_releases_insert AFTER INSERT ON review_releases BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = NEW.project_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_releases_update AFTER UPDATE ON review_releases BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = NEW.project_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_releases_delete AFTER DELETE ON review_releases BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = OLD.project_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_feedback_insert AFTER INSERT ON review_feedback BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_feedback_update AFTER UPDATE ON review_feedback BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_feedback_delete AFTER DELETE ON review_feedback BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = OLD.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_release_messages_insert AFTER INSERT ON release_messages BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_release_messages_update AFTER UPDATE ON release_messages BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_release_messages_delete AFTER DELETE ON release_messages BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = OLD.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_decisions_insert AFTER INSERT ON review_decisions BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_decisions_update AFTER UPDATE ON review_decisions BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_decisions_delete AFTER DELETE ON review_decisions BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = (SELECT project_id FROM review_releases WHERE id = OLD.release_id); END;
--> statement-breakpoint
INSERT OR IGNORE INTO integration_instance(singleton,id) VALUES(1,'instance_' || lower(hex(randomblob(16))));
