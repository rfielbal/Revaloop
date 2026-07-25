type TableColumn = {
  name: string;
  notnull: number;
};

type ForeignKey = {
  from: string;
  on_delete: string;
};

function isDuplicateColumnError(error: unknown) {
  return (
    error instanceof Error &&
    /duplicate column name/i.test(error.message)
  );
}

async function addColumnWhenMissing(
  db: D1Database,
  table: "review_feedback" | "review_releases",
  column: string,
  statement: string,
) {
  const columns = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<TableColumn>();

  if (columns.results.some((item) => item.name === column)) {
    return;
  }

  try {
    await db.prepare(statement).run();
  } catch (error) {
    // Deux isolates peuvent initialiser la même D1 simultanément. Le second
    // observe alors une colonne déjà ajoutée par le premier.
    if (!isDuplicateColumnError(error)) {
      throw error;
    }
  }
}

async function reviewDecisionsAreCompatible(db: D1Database) {
  const [columns, foreignKeys] = await Promise.all([
    db
      .prepare("PRAGMA table_info(review_decisions)")
      .all<TableColumn>(),
    db
      .prepare("PRAGMA foreign_key_list(review_decisions)")
      .all<ForeignKey>(),
  ]);

  const reviewerSession = columns.results.find(
    (column) => column.name === "reviewer_session_id",
  );
  const reviewerSessionForeignKey = foreignKeys.results.find(
    (foreignKey) => foreignKey.from === "reviewer_session_id",
  );

  return (
    reviewerSession?.notnull === 0 &&
    reviewerSessionForeignKey?.on_delete.toUpperCase() === "SET NULL"
  );
}

async function migrateReviewDecisions(db: D1Database) {
  if (await reviewDecisionsAreCompatible(db)) {
    return;
  }

  // Le nom est créé en interne et ne contient que des caractères
  // alphanumériques. Il évite qu’un bootstrap concurrent partage une table
  // temporaire avec un autre isolate.
  const temporaryTable = `__review_decisions_${crypto
    .randomUUID()
    .replaceAll("-", "")}`;

  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE ${temporaryTable} (
          id TEXT PRIMARY KEY NOT NULL,
          release_id TEXT NOT NULL,
          reviewer_session_id TEXT,
          status TEXT NOT NULL,
          author_name TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE,
          FOREIGN KEY (reviewer_session_id) REFERENCES reviewer_sessions(id) ON DELETE SET NULL
        )`,
      ),
      db.prepare(
        `INSERT INTO ${temporaryTable}
          (id, release_id, reviewer_session_id, status, author_name, note, created_at)
         SELECT id, release_id, reviewer_session_id, status, author_name, note, created_at
         FROM review_decisions`,
      ),
      db.prepare("DROP TABLE review_decisions"),
      db.prepare(
        `ALTER TABLE ${temporaryTable} RENAME TO review_decisions`,
      ),
      db.prepare(
        `CREATE UNIQUE INDEX review_decisions_release_unique
         ON review_decisions (release_id)`,
      ),
      db.prepare(
        `CREATE INDEX review_decisions_session_idx
         ON review_decisions (reviewer_session_id)`,
      ),
    ]);
  } catch (error) {
    // Si un autre isolate a terminé la migration entre l’inspection et le
    // batch, l’état final compatible suffit. Toute autre erreur reste fatale.
    if (!(await reviewDecisionsAreCompatible(db))) {
      throw error;
    }
  }
}

/**
 * Rend le bootstrap runtime compatible avec les bases créées par les
 * migrations 0001 à 0004. Les nouvelles installations sont déjà conformes ;
 * ces opérations restent alors de simples lectures PRAGMA.
 */
export async function ensureDatabaseCompatibility(db: D1Database) {
  await addColumnWhenMissing(
    db,
    "review_releases",
    "preview_revision",
    `ALTER TABLE review_releases
     ADD COLUMN preview_revision INTEGER NOT NULL DEFAULT 0`,
  );
  await addColumnWhenMissing(
    db,
    "review_feedback",
    "author_type",
    `ALTER TABLE review_feedback
     ADD COLUMN author_type TEXT NOT NULL DEFAULT 'reviewer'`,
  );
  await migrateReviewDecisions(db);
}
