import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const migrationFiles = [
  "0000_redundant_vance_astro.sql",
  "0001_sleepy_paper_doll.sql",
  "0002_sticky_mystique.sql",
  "0003_sparkling_wrecker.sql",
  "0004_new_ben_parker.sql",
];

function runMigration(database, sql) {
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) {
      database.exec(statement);
    }
  }
}

function createD1Adapter(database) {
  class PreparedStatement {
    constructor(sql) {
      this.sql = sql;
      this.parameters = [];
    }

    bind(...parameters) {
      this.parameters = parameters;
      return this;
    }

    run() {
      return database.prepare(this.sql).run(...this.parameters);
    }

    all() {
      return {
        results: database.prepare(this.sql).all(...this.parameters),
      };
    }
  }

  return {
    prepare(sql) {
      return new PreparedStatement(sql);
    },
    batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

async function loadCompatibilityMigration() {
  const source = await readFile(
    new URL("../db/compatibility-migrations.ts", import.meta.url),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const transpiledModule = { exports: {} };

  Function("exports", "module", output)(
    transpiledModule.exports,
    transpiledModule,
  );
  return transpiledModule.exports.ensureDatabaseCompatibility;
}

async function readMigrations() {
  return Promise.all(
    migrationFiles.map((file) =>
      readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"),
    ),
  );
}

test("applique réellement toutes les migrations D1 dans l’ordre", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");

  for (const migration of await readMigrations()) {
    runMigration(database, migration);
  }

  const tables = database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    )
    .all()
    .map(({ name }) => name);
  const feedbackColumns = database
    .prepare("PRAGMA table_info(review_feedback)")
    .all();
  const decisionColumns = database
    .prepare("PRAGMA table_info(review_decisions)")
    .all();
  const decisionForeignKeys = database
    .prepare("PRAGMA foreign_key_list(review_decisions)")
    .all();

  assert.equal(tables.length, 20);
  assert.ok(
    feedbackColumns.some(({ name }) => name === "author_type"),
  );
  assert.equal(
    decisionColumns.find(({ name }) => name === "reviewer_session_id")
      ?.notnull,
    0,
  );
  assert.equal(
    decisionForeignKeys
      .find(({ from }) => from === "reviewer_session_id")
      ?.on_delete.toUpperCase(),
    "SET NULL",
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});

test("répare au runtime une base restée sur la migration 0001", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrations = await readMigrations();

  runMigration(database, migrations[0]);
  runMigration(database, migrations[1]);

  database.exec(`
    INSERT INTO app_users
      (id, email, display_name, created_at, last_seen_at)
    VALUES
      ('user_1', 'dev@example.test', 'Développeur', '2026-01-01', '2026-01-01');
    INSERT INTO organizations
      (id, name, slug, created_at)
    VALUES
      ('org_1', 'Studio', 'studio', '2026-01-01');
    INSERT INTO client_projects
      (id, organization_id, slug, name, description, accent, created_at, updated_at)
    VALUES
      ('project_1', 'org_1', 'projet', 'Projet', '', '#ddebec', '2026-01-01', '2026-01-01');
    INSERT INTO review_releases
      (id, project_id, version, title, commit_sha, status, preview_kind,
       preview_url, reviewer_message, feedback_sequence, created_by, created_at,
       updated_at, expires_at, closed_at)
    VALUES
      ('release_1', 'project_1', 'v1', 'Version 1', '', 'in_review',
       'external', 'https://preview.example.test', '', 0, 'user_1',
       '2026-01-01', '2026-01-01', '2027-01-01', NULL);
    INSERT INTO review_invitations
      (id, release_id, token_hash, reviewer_name, reviewer_email, created_by,
       created_at, expires_at, used_at, revoked_at)
    VALUES
      ('invitation_1', 'release_1', 'invitation_hash', 'Cliente', NULL,
       'user_1', '2026-01-01', '2027-01-01', '2026-01-01', NULL);
    INSERT INTO reviewer_sessions
      (id, invitation_id, release_id, token_hash, reviewer_name, created_at,
       last_seen_at, expires_at, revoked_at)
    VALUES
      ('session_1', 'invitation_1', 'release_1', 'session_hash', 'Cliente',
       '2026-01-01', '2026-01-01', '2027-01-01', NULL);
    INSERT INTO review_decisions
      (id, release_id, reviewer_session_id, status, author_name, note, created_at)
    VALUES
      ('decision_1', 'release_1', 'session_1', 'changes_requested',
       'Cliente', 'À reprendre', '2026-01-01');
  `);

  const ensureDatabaseCompatibility = await loadCompatibilityMigration();
  const d1 = createD1Adapter(database);

  await ensureDatabaseCompatibility(d1);
  await ensureDatabaseCompatibility(d1);

  const releaseColumns = database
    .prepare("PRAGMA table_info(review_releases)")
    .all();
  const feedbackColumns = database
    .prepare("PRAGMA table_info(review_feedback)")
    .all();
  const decisionColumns = database
    .prepare("PRAGMA table_info(review_decisions)")
    .all();
  const decisionForeignKeys = database
    .prepare("PRAGMA foreign_key_list(review_decisions)")
    .all();

  assert.ok(
    releaseColumns.some(({ name }) => name === "preview_revision"),
  );
  assert.ok(
    feedbackColumns.some(({ name }) => name === "author_type"),
  );
  assert.equal(
    decisionColumns.find(({ name }) => name === "reviewer_session_id")
      ?.notnull,
    0,
  );
  assert.equal(
    decisionForeignKeys
      .find(({ from }) => from === "reviewer_session_id")
      ?.on_delete.toUpperCase(),
    "SET NULL",
  );
  assert.equal(
    database
      .prepare(
        "SELECT note FROM review_decisions WHERE id = 'decision_1'",
      )
      .get()?.note,
    "À reprendre",
  );

  database.exec("DELETE FROM reviewer_sessions WHERE id = 'session_1'");
  assert.equal(
    database
      .prepare(
        "SELECT reviewer_session_id FROM review_decisions WHERE id = 'decision_1'",
      )
      .get()?.reviewer_session_id,
    null,
  );
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
});
