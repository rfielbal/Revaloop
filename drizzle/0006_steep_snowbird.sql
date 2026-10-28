CREATE TABLE `integration_organization_receipts` (
	`organization_id` text NOT NULL,
	`request_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`execution_id` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`organization_id`, `request_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integration_organization_revisions` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `integration_organization_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`label` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_organization_tokens_token_hash_unique` ON `integration_organization_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `integration_organization_tokens_org_idx` ON `integration_organization_tokens` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE VIEW IF NOT EXISTS integration_credentials AS SELECT id,token_hash,user_id,organization_id,project_id,label,capabilities_json,created_at,expires_at,revoked_at,last_used_at,'project' AS scope FROM integration_tokens UNION ALL SELECT id,token_hash,user_id,organization_id,NULL AS project_id,label,capabilities_json,created_at,expires_at,revoked_at,last_used_at,'organization' AS scope FROM integration_organization_tokens;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_organization_insert AFTER INSERT ON organizations BEGIN INSERT OR IGNORE INTO integration_organization_revisions(organization_id,revision) VALUES(NEW.id,0); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_catalog_project_insert AFTER INSERT ON client_projects BEGIN UPDATE integration_organization_revisions SET revision=revision+1 WHERE organization_id=NEW.organization_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_catalog_project_update AFTER UPDATE ON client_projects BEGIN UPDATE integration_organization_revisions SET revision=revision+1 WHERE organization_id=NEW.organization_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_catalog_project_delete AFTER DELETE ON client_projects BEGIN UPDATE integration_organization_revisions SET revision=revision+1 WHERE organization_id=OLD.organization_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_catalog_revision AFTER UPDATE ON integration_project_revisions BEGIN UPDATE integration_organization_revisions SET revision=revision+1 WHERE organization_id=(SELECT organization_id FROM client_projects WHERE id=NEW.project_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_invitations_insert AFTER INSERT ON review_invitations BEGIN UPDATE integration_project_revisions SET revision=revision+1 WHERE project_id=(SELECT project_id FROM review_releases WHERE id=NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_invitations_update AFTER UPDATE ON review_invitations BEGIN UPDATE integration_project_revisions SET revision=revision+1 WHERE project_id=(SELECT project_id FROM review_releases WHERE id=NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_invitations_delete AFTER DELETE ON review_invitations BEGIN UPDATE integration_project_revisions SET revision=revision+1 WHERE project_id=(SELECT project_id FROM review_releases WHERE id=OLD.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_test_items_insert AFTER INSERT ON review_test_items BEGIN UPDATE integration_project_revisions SET revision=revision+1 WHERE project_id=(SELECT project_id FROM review_releases WHERE id=NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_test_items_update AFTER UPDATE ON review_test_items BEGIN UPDATE integration_project_revisions SET revision=revision+1 WHERE project_id=(SELECT project_id FROM review_releases WHERE id=NEW.release_id); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS integration_review_test_items_delete AFTER DELETE ON review_test_items BEGIN UPDATE integration_project_revisions SET revision=revision+1 WHERE project_id=(SELECT project_id FROM review_releases WHERE id=OLD.release_id); END;
