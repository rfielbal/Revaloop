/** Additive tables/triggers: existing review routes keep their semantics. */
export const integrationSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS integration_instance (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), id TEXT NOT NULL UNIQUE)`,
  `CREATE TABLE IF NOT EXISTS integration_project_revisions (project_id TEXT PRIMARY KEY REFERENCES client_projects(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS integration_tokens (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE, label TEXT NOT NULL,
    capabilities_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS integration_tokens_project_idx ON integration_tokens(project_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS integration_command_receipts (
    project_id TEXT NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE, request_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL, execution_id TEXT NOT NULL, result_json TEXT NOT NULL,
    created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id))`,
  `INSERT OR IGNORE INTO integration_project_revisions(project_id, revision) SELECT id, 0 FROM client_projects`,
  `CREATE TRIGGER IF NOT EXISTS integration_project_insert AFTER INSERT ON client_projects BEGIN
    INSERT OR IGNORE INTO integration_project_revisions(project_id, revision) VALUES (NEW.id, 0); END`,
  `CREATE TRIGGER IF NOT EXISTS integration_project_update AFTER UPDATE ON client_projects BEGIN
    UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = NEW.id; END`,
  ...[
    "review_releases",
    "review_feedback",
    "release_messages",
    "review_decisions",
  ].flatMap((table) =>
    ["INSERT", "UPDATE", "DELETE"].map((operation) => {
      const row = operation === "DELETE" ? "OLD" : "NEW";
      const project =
        table === "review_releases"
          ? `${row}.project_id`
          : `(SELECT project_id FROM review_releases WHERE id = ${row}.release_id)`;
      return `CREATE TRIGGER IF NOT EXISTS integration_${table}_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN
        UPDATE integration_project_revisions SET revision = revision + 1 WHERE project_id = ${project}; END`;
    }),
  ),
];
