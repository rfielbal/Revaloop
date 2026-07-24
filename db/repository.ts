import { env } from "cloudflare:workers";
import {
  demoFeedback,
  demoProject,
  demoRelease,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
  type Project,
  type Release,
  type ReviewDecision,
  type ReviewPayload,
} from "../lib/revaloop";

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  created_at: string;
};

type ReleaseRow = {
  id: string;
  project_id: string;
  version: string;
  title: string;
  commit_sha: string;
  status: Release["status"];
  share_token: string;
  created_at: string;
  expires_at: string;
};

type FeedbackRow = {
  id: string;
  release_id: string;
  sequence: number;
  type: FeedbackType;
  title: string;
  body: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  page_path: string;
  viewport: string;
  position_x: number | null;
  position_y: number | null;
  author_name: string;
  created_at: string;
  updated_at: string;
};

type DecisionRow = {
  id: string;
  release_id: string;
  status: ReviewDecision["status"];
  author_name: string;
  note: string;
  created_at: string;
};

let databaseReady: Promise<void> | null = null;

function database() {
  if (!env.DB) {
    throw new Error("La base D1 de Revaloop n’est pas disponible.");
  }

  return env.DB;
}

async function bootstrapDatabase() {
  const db = database();

  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        accent TEXT DEFAULT '#dfff4f' NOT NULL,
        created_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS releases (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        version TEXT NOT NULL,
        title TEXT NOT NULL,
        commit_sha TEXT NOT NULL,
        status TEXT DEFAULT 'draft' NOT NULL,
        share_token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON UPDATE no action ON DELETE cascade
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS feedback_items (
        id TEXT PRIMARY KEY NOT NULL,
        release_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT DEFAULT 'open' NOT NULL,
        priority TEXT DEFAULT 'normal' NOT NULL,
        page_path TEXT DEFAULT '/' NOT NULL,
        viewport TEXT DEFAULT 'desktop' NOT NULL,
        position_x INTEGER,
        position_y INTEGER,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE no action ON DELETE cascade
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY NOT NULL,
        release_id TEXT NOT NULL,
        status TEXT NOT NULL,
        author_name TEXT NOT NULL,
        note TEXT DEFAULT '' NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (release_id) REFERENCES releases(id) ON UPDATE no action ON DELETE cascade
      )
    `),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS releases_project_idx ON releases (project_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS feedback_release_idx ON feedback_items (release_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback_items (status)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS decisions_release_idx ON decisions (release_id)",
    ),
  ]);

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO projects
          (id, slug, name, description, accent, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        demoProject.id,
        demoProject.slug,
        demoProject.name,
        demoProject.description,
        demoProject.accent,
        demoProject.createdAt,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO releases
          (id, project_id, version, title, commit_sha, status, share_token, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        demoRelease.id,
        demoRelease.projectId,
        demoRelease.version,
        demoRelease.title,
        demoRelease.commitSha,
        demoRelease.status,
        demoRelease.shareToken,
        demoRelease.createdAt,
        demoRelease.expiresAt,
      ),
    ...demoFeedback.map((item) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO feedback_items
            (id, release_id, sequence, type, title, body, status, priority, page_path, viewport,
             position_x, position_y, author_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          item.id,
          item.releaseId,
          item.sequence,
          item.type,
          item.title,
          item.body,
          item.status,
          item.priority,
          item.pagePath,
          item.viewport,
          item.positionX,
          item.positionY,
          item.authorName,
          item.createdAt,
          item.updatedAt,
        ),
    ),
  ]);
}

export async function ensureDatabase() {
  databaseReady ??= bootstrapDatabase();

  try {
    await databaseReady;
  } catch (error) {
    databaseReady = null;
    throw error;
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    accent: row.accent,
    createdAt: row.created_at,
  };
}

function mapRelease(row: ReleaseRow): Release {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    title: row.title,
    commitSha: row.commit_sha,
    status: row.status,
    shareToken: row.share_token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function mapFeedback(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    releaseId: row.release_id,
    sequence: row.sequence,
    type: row.type,
    title: row.title,
    body: row.body,
    status: row.status,
    priority: row.priority,
    pagePath: row.page_path,
    viewport: row.viewport,
    positionX: row.position_x,
    positionY: row.position_y,
    authorName: row.author_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDecision(row: DecisionRow): ReviewDecision {
  return {
    id: row.id,
    releaseId: row.release_id,
    status: row.status,
    authorName: row.author_name,
    note: row.note,
    createdAt: row.created_at,
  };
}

export async function getReviewByToken(
  token: string,
): Promise<ReviewPayload | null> {
  await ensureDatabase();
  const db = database();

  const releaseRow = await db
    .prepare("SELECT * FROM releases WHERE share_token = ? LIMIT 1")
    .bind(token)
    .first<ReleaseRow>();

  if (!releaseRow) {
    return null;
  }

  const [projectRow, feedbackResult, decisionResult] = await Promise.all([
    db
      .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
      .bind(releaseRow.project_id)
      .first<ProjectRow>(),
    db
      .prepare(
        "SELECT * FROM feedback_items WHERE release_id = ? ORDER BY sequence ASC",
      )
      .bind(releaseRow.id)
      .all<FeedbackRow>(),
    db
      .prepare(
        "SELECT * FROM decisions WHERE release_id = ? ORDER BY created_at DESC",
      )
      .bind(releaseRow.id)
      .all<DecisionRow>(),
  ]);

  if (!projectRow) {
    return null;
  }

  return {
    project: mapProject(projectRow),
    release: mapRelease(releaseRow),
    feedback: feedbackResult.results.map(mapFeedback),
    decisions: decisionResult.results.map(mapDecision),
  };
}

export async function getDemoWorkspace(): Promise<ReviewPayload> {
  const payload = await getReviewByToken(demoRelease.shareToken);

  if (!payload) {
    throw new Error("La démonstration Revaloop n’a pas pu être initialisée.");
  }

  return payload;
}

export async function createFeedback(input: {
  releaseId: string;
  type: FeedbackType;
  title: string;
  body: string;
  priority: FeedbackPriority;
  pagePath: string;
  viewport: string;
  positionX: number | null;
  positionY: number | null;
  authorName: string;
}): Promise<FeedbackItem> {
  await ensureDatabase();
  const db = database();
  const nextRow = await db
    .prepare(
      "SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM feedback_items WHERE release_id = ?",
    )
    .bind(input.releaseId)
    .first<{ next_sequence: number }>();

  const now = new Date().toISOString();
  const item: FeedbackItem = {
    id: crypto.randomUUID(),
    releaseId: input.releaseId,
    sequence: nextRow?.next_sequence ?? 1,
    type: input.type,
    title: input.title.trim(),
    body: input.body.trim(),
    status: "open",
    priority: input.priority,
    pagePath: input.pagePath,
    viewport: input.viewport,
    positionX: input.positionX,
    positionY: input.positionY,
    authorName: input.authorName.trim(),
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO feedback_items
        (id, release_id, sequence, type, title, body, status, priority, page_path, viewport,
         position_x, position_y, author_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      item.id,
      item.releaseId,
      item.sequence,
      item.type,
      item.title,
      item.body,
      item.status,
      item.priority,
      item.pagePath,
      item.viewport,
      item.positionX,
      item.positionY,
      item.authorName,
      item.createdAt,
      item.updatedAt,
    )
    .run();

  await db
    .prepare(
      "UPDATE releases SET status = 'changes_requested' WHERE id = ? AND status != 'approved'",
    )
    .bind(input.releaseId)
    .run();

  return item;
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
): Promise<FeedbackItem | null> {
  await ensureDatabase();
  const db = database();
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      "UPDATE feedback_items SET status = ?, updated_at = ? WHERE id = ?",
    )
    .bind(status, updatedAt, id)
    .run();

  const row = await db
    .prepare("SELECT * FROM feedback_items WHERE id = ? LIMIT 1")
    .bind(id)
    .first<FeedbackRow>();

  return row ? mapFeedback(row) : null;
}

export async function createDecision(input: {
  releaseId: string;
  status: ReviewDecision["status"];
  authorName: string;
  note: string;
}): Promise<ReviewDecision> {
  await ensureDatabase();
  const db = database();
  const decision: ReviewDecision = {
    id: crypto.randomUUID(),
    releaseId: input.releaseId,
    status: input.status,
    authorName: input.authorName.trim(),
    note: input.note.trim(),
    createdAt: new Date().toISOString(),
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO decisions
          (id, release_id, status, author_name, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        decision.id,
        decision.releaseId,
        decision.status,
        decision.authorName,
        decision.note,
        decision.createdAt,
      ),
    db
      .prepare("UPDATE releases SET status = ? WHERE id = ?")
      .bind(decision.status, decision.releaseId),
  ]);

  return decision;
}
