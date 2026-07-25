import { env } from "cloudflare:workers";
import type { DeveloperIdentity } from "../lib/auth";
import {
  type CreatedInvitation,
  type DeveloperProjectSummary,
  type DeveloperWorkspace,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
  type Project,
  type Release,
  type ReleaseMessage as SharedReleaseMessage,
  type ReviewDecision,
  type ReviewPayload,
  type ReviewTestItem,
} from "../lib/revaloop";
import { generateSecret, sha256 } from "../lib/security";

type MemberContext = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: "owner" | "developer";
  displayName: string;
  email: string;
};

export type DeveloperCredentialRecord = {
  userId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

export type ReleaseMessage = SharedReleaseMessage;

export type ReleaseWithRevision = Release & {
  previewRevision: number;
};

export type ReviewPayloadWithMessages = Omit<
  ReviewPayload,
  "release" | "messages"
> & {
  release: ReleaseWithRevision;
  messages: ReleaseMessage[];
};

type ProjectRow = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string;
  accent: string;
  created_at: string;
  updated_at: string;
};

type ReleaseRow = {
  id: string;
  project_id: string;
  version: string;
  title: string;
  commit_sha: string;
  status: Release["status"];
  preview_kind: "external";
  preview_url: string;
  reviewer_message: string;
  feedback_sequence: number;
  preview_revision: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  closed_at: string | null;
};

type FeedbackRow = {
  id: string;
  release_id: string;
  author_session_id: string | null;
  sequence: number;
  type: FeedbackType;
  title: string;
  body: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  page_path: string;
  page_title: string;
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
  reviewer_session_id: string | null;
  status: ReviewDecision["status"];
  author_name: string;
  note: string;
  created_at: string;
};

type TestItemRow = {
  id: string;
  release_id: string;
  position: number;
  title: string;
  description: string;
  created_at: string;
};

type ReviewerAccessRow = {
  session_id: string;
  invitation_id: string;
  release_id: string;
  reviewer_name: string;
  session_expires_at: string;
  invitation_expires_at: string;
  release_expires_at: string;
  organization_id: string;
  project_id: string;
};

type InvitationExchangeRow = {
  id: string;
  release_id: string;
  reviewer_name: string;
  expires_at: string;
};

type FeedbackAccessRow = FeedbackRow & {
  release_status: Release["status"];
  release_expires_at: string;
  project_id: string;
  organization_id: string;
};

type ReleaseMessageRow = {
  id: string;
  release_id: string;
  author_type: "developer" | "reviewer";
  author_name: string;
  body: string;
  created_at: string;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS developer_credentials (
    user_id TEXT PRIMARY KEY NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS developer_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS developer_sessions_user_idx
    ON developer_sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS developer_sessions_expires_idx
    ON developer_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS organization_members (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'developer',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS organization_members_org_user_unique
    ON organization_members (organization_id, user_id)`,
  `CREATE INDEX IF NOT EXISTS organization_members_user_idx
    ON organization_members (user_id)`,
  `CREATE TABLE IF NOT EXISTS client_projects (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#ddebec',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS client_projects_org_slug_unique
    ON client_projects (organization_id, slug)`,
  `CREATE INDEX IF NOT EXISTS client_projects_org_idx
    ON client_projects (organization_id)`,
  `CREATE TABLE IF NOT EXISTS review_releases (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    commit_sha TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'in_review',
    preview_kind TEXT NOT NULL DEFAULT 'external',
    preview_url TEXT NOT NULL,
    reviewer_message TEXT NOT NULL DEFAULT '',
    feedback_sequence INTEGER NOT NULL DEFAULT 0,
    preview_revision INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    closed_at TEXT,
    FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS review_releases_project_idx
    ON review_releases (project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS review_releases_project_version_unique
    ON review_releases (project_id, version)`,
  `CREATE TABLE IF NOT EXISTS review_test_items (
    id TEXT PRIMARY KEY NOT NULL,
    release_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS review_test_items_release_position_unique
    ON review_test_items (release_id, position)`,
  `CREATE INDEX IF NOT EXISTS review_test_items_release_idx
    ON review_test_items (release_id)`,
  `CREATE TABLE IF NOT EXISTS review_invitations (
    id TEXT PRIMARY KEY NOT NULL,
    release_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    reviewer_name TEXT NOT NULL,
    reviewer_email TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    revoked_at TEXT,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE RESTRICT
  )`,
  `CREATE INDEX IF NOT EXISTS review_invitations_release_idx
    ON review_invitations (release_id)`,
  `CREATE INDEX IF NOT EXISTS review_invitations_token_idx
    ON review_invitations (token_hash)`,
  `CREATE TABLE IF NOT EXISTS reviewer_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    invitation_id TEXT NOT NULL,
    release_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    reviewer_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (invitation_id) REFERENCES review_invitations(id) ON DELETE CASCADE,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS reviewer_sessions_release_idx
    ON reviewer_sessions (release_id)`,
  `CREATE INDEX IF NOT EXISTS reviewer_sessions_invitation_idx
    ON reviewer_sessions (invitation_id)`,
  `CREATE TABLE IF NOT EXISTS release_messages (
    id TEXT PRIMARY KEY NOT NULL,
    release_id TEXT NOT NULL,
    author_type TEXT NOT NULL,
    author_user_id TEXT,
    author_session_id TEXT,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
    FOREIGN KEY (author_session_id) REFERENCES reviewer_sessions(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS release_messages_release_created_idx
    ON release_messages (release_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS release_messages_author_user_idx
    ON release_messages (author_user_id)`,
  `CREATE INDEX IF NOT EXISTS release_messages_author_session_idx
    ON release_messages (author_session_id)`,
  `CREATE TABLE IF NOT EXISTS review_feedback (
    id TEXT PRIMARY KEY NOT NULL,
    release_id TEXT NOT NULL,
    author_session_id TEXT,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    page_path TEXT NOT NULL DEFAULT '/',
    page_title TEXT NOT NULL DEFAULT '',
    viewport TEXT NOT NULL DEFAULT 'desktop',
    position_x INTEGER,
    position_y INTEGER,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE,
    FOREIGN KEY (author_session_id) REFERENCES reviewer_sessions(id) ON DELETE SET NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS review_feedback_release_sequence_unique
    ON review_feedback (release_id, sequence)`,
  `CREATE INDEX IF NOT EXISTS review_feedback_release_idx
    ON review_feedback (release_id)`,
  `CREATE INDEX IF NOT EXISTS review_feedback_status_idx
    ON review_feedback (status)`,
  `CREATE TABLE IF NOT EXISTS review_decisions (
    id TEXT PRIMARY KEY NOT NULL,
    release_id TEXT NOT NULL UNIQUE,
    reviewer_session_id TEXT,
    status TEXT NOT NULL,
    author_name TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_session_id) REFERENCES reviewer_sessions(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS review_decisions_session_idx
    ON review_decisions (reviewer_session_id)`,
  `CREATE TABLE IF NOT EXISTS review_test_completions (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    test_item_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES reviewer_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (test_item_id) REFERENCES review_test_items(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS review_test_completions_session_item_unique
    ON review_test_completions (session_id, test_item_id)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    project_id TEXT,
    release_id TEXT,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES client_projects(id) ON DELETE SET NULL,
    FOREIGN KEY (release_id) REFERENCES review_releases(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_events_org_created_idx
    ON audit_events (organization_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_events_release_idx
    ON audit_events (release_id)`,
  `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
    key TEXT PRIMARY KEY NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL
  )`,
];

let databaseReady: Promise<void> | null = null;

export class ReviewExpiredError extends Error {
  readonly status = 410;

  constructor(message = "Cet accès de recette a expiré.") {
    super(message);
    this.name = "ReviewExpiredError";
  }
}

export class ReviewConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ReviewConflictError";
  }
}

export class ReviewForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Vous n’êtes pas autorisé à effectuer cette action.") {
    super(message);
    this.name = "ReviewForbiddenError";
  }
}

export class ReviewNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Ressource introuvable.") {
    super(message);
    this.name = "ReviewNotFoundError";
  }
}

export class RateLimitError extends Error {
  readonly status = 429;
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("Trop de tentatives. Réessayez dans quelques instants.");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

function database() {
  if (!env.DB) {
    throw new Error("La base D1 de Revaloop n’est pas disponible.");
  }

  return env.DB;
}

async function bootstrapDatabase() {
  const db = database();
  const statements = schemaStatements.map((statement) =>
    db.prepare(statement),
  );

  for (let index = 0; index < statements.length; index += 20) {
    await db.batch(statements.slice(index, index + 20));
  }

  const releaseColumns = await db
    .prepare("PRAGMA table_info(review_releases)")
    .all<{ name: string }>();

  if (
    !releaseColumns.results.some((column) => column.name === "preview_revision")
  ) {
    try {
      await db
        .prepare(
          `ALTER TABLE review_releases
           ADD COLUMN preview_revision INTEGER NOT NULL DEFAULT 0`,
        )
        .run();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/duplicate column name/i.test(error.message)
      ) {
        throw error;
      }
    }
  }

  const now = new Date();
  const staleOperationalData = new Date(
    now.getTime() - 30 * 86_400_000,
  ).toISOString();
  const staleAuditData = new Date(
    now.getTime() - 365 * 86_400_000,
  ).toISOString();

  await db.batch([
    db
      .prepare("DELETE FROM rate_limit_buckets WHERE expires_at <= ?")
      .bind(now.toISOString()),
    db
      .prepare(
        `DELETE FROM developer_sessions
         WHERE expires_at <= ?
            OR (revoked_at IS NOT NULL AND revoked_at <= ?)`,
      )
      .bind(staleOperationalData, staleOperationalData),
    db
      .prepare(
        `DELETE FROM reviewer_sessions
         WHERE (expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?))
           AND NOT EXISTS (
             SELECT 1 FROM review_decisions
             WHERE review_decisions.reviewer_session_id = reviewer_sessions.id
           )`,
      )
      .bind(staleOperationalData, staleOperationalData),
    db
      .prepare(
        `DELETE FROM review_invitations
         WHERE (
           expires_at <= ?
           OR (revoked_at IS NOT NULL AND revoked_at <= ?)
           OR (used_at IS NOT NULL AND used_at <= ?)
         )
           AND NOT EXISTS (
             SELECT 1 FROM reviewer_sessions
             WHERE reviewer_sessions.invitation_id = review_invitations.id
           )`,
      )
      .bind(
        staleOperationalData,
        staleOperationalData,
        staleOperationalData,
      ),
    db
      .prepare("DELETE FROM audit_events WHERE created_at <= ?")
      .bind(staleAuditData),
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

function slugify(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return normalized || "projet";
}

function shortId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    accent: row.accent,
    createdAt: row.created_at,
  };
}

function mapRelease(row: ReleaseRow): ReleaseWithRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    title: row.title,
    commitSha: row.commit_sha,
    status: row.status,
    previewKind: row.preview_kind,
    previewUrl: row.preview_url,
    reviewerMessage: row.reviewer_message,
    previewRevision: row.preview_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
  };
}

function mapReleaseMessage(row: ReleaseMessageRow): ReleaseMessage {
  return {
    id: row.id,
    releaseId: row.release_id,
    authorRole: row.author_type,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
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
    pageTitle: row.page_title,
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

function mapTestItem(row: TestItemRow): ReviewTestItem {
  return {
    id: row.id,
    releaseId: row.release_id,
    position: row.position,
    title: row.title,
    description: row.description,
  };
}

function assertActiveDate(value: string, message?: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new ReviewExpiredError(message);
  }
}

async function auditStatement(input: {
  organizationId: string;
  projectId?: string | null;
  releaseId?: string | null;
  actorType: "developer" | "reviewer" | "system";
  actorId: string;
  action: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  return database()
    .prepare(
      `INSERT INTO audit_events
        (id, organization_id, project_id, release_id, actor_type, actor_id,
         action, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.organizationId,
      input.projectId ?? null,
      input.releaseId ?? null,
      input.actorType,
      input.actorId,
      input.action,
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString(),
    );
}

export async function countDeveloperCredentials(): Promise<number> {
  await ensureDatabase();
  const row = await database()
    .prepare("SELECT COUNT(*) AS count FROM developer_credentials")
    .first<{ count: number }>();

  return row?.count ?? 0;
}

export async function getDeveloperCredential(
  email: string,
): Promise<DeveloperCredentialRecord | null> {
  await ensureDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const row = await database()
    .prepare(
      `SELECT
         app_users.id AS user_id,
         app_users.email,
         app_users.display_name,
         developer_credentials.password_hash,
         developer_credentials.password_salt,
         developer_credentials.password_iterations
       FROM developer_credentials
       INNER JOIN app_users
         ON app_users.id = developer_credentials.user_id
       WHERE app_users.email = ?
       LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<{
      user_id: string;
      email: string;
      display_name: string;
      password_hash: string;
      password_salt: string;
      password_iterations: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: row.password_iterations,
  };
}

export async function registerDeveloperCredential(input: {
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  allowAdditional?: boolean;
}): Promise<DeveloperIdentity> {
  await ensureDatabase();
  const db = database();
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim() || normalizedEmail;

  if (
    !normalizedEmail ||
    !input.passwordHash ||
    !input.passwordSalt ||
    !Number.isSafeInteger(input.passwordIterations) ||
    input.passwordIterations <= 0
  ) {
    throw new ReviewConflictError(
      "Les informations d’inscription développeur sont invalides.",
    );
  }

  const existingUser = await db
    .prepare("SELECT id FROM app_users WHERE email = ? LIMIT 1")
    .bind(normalizedEmail)
    .first<{ id: string }>();

  if (!input.allowAdditional && !existingUser) {
    const legacyUsers = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM app_users
         WHERE EXISTS (
           SELECT 1 FROM organization_members
           WHERE organization_members.user_id = app_users.id
         )`,
      )
      .first<{ count: number }>();

    if ((legacyUsers?.count ?? 0) > 0) {
      throw new ReviewConflictError(
        "Cette instance contient déjà un espace à reprendre. Utilisez l’adresse e-mail du compte développeur historique avant d’ouvrir l’accès public.",
      );
    }
  }

  const identityDigest = await sha256(normalizedEmail);
  const userId =
    existingUser?.id ?? `user_${identityDigest.slice(0, 32)}`;
  const organizationId = `org_${identityDigest.slice(0, 32)}`;
  const organizationName = `${displayName} · Revaloop`;
  const organizationSlug = `${slugify(displayName || normalizedEmail)}-${identityDigest.slice(0, 12)}`;
  const memberId = `member_${identityDigest.slice(0, 32)}`;
  const now = new Date().toISOString();
  const allowAdditional = input.allowAdditional ? 1 : 0;
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO app_users
          (id, email, display_name, created_at, last_seen_at)
         SELECT ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM app_users WHERE email = ?
         )
           AND (
             ? = 1
             OR NOT EXISTS (SELECT 1 FROM developer_credentials)
           )`,
      )
      .bind(
        userId,
        normalizedEmail,
        displayName,
        now,
        now,
        normalizedEmail,
        allowAdditional,
      ),
    db
      .prepare(
        `UPDATE app_users
         SET display_name = ?, last_seen_at = ?
         WHERE id = ?
           AND email = ?
           AND (
             ? = 1
             OR NOT EXISTS (SELECT 1 FROM developer_credentials)
           )`,
      )
      .bind(
        displayName,
        now,
        userId,
        normalizedEmail,
        allowAdditional,
      ),
    db
      .prepare(
        `UPDATE organizations
         SET name = ?
         WHERE id IN (
           SELECT organization_id
           FROM organization_members
           WHERE user_id = ? AND role = 'owner'
         )
           AND (
             ? = 1
             OR NOT EXISTS (SELECT 1 FROM developer_credentials)
           )`,
      )
      .bind(
        organizationName,
        userId,
        allowAdditional,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO organizations (id, name, slug, created_at)
         SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM organization_members WHERE user_id = ?
         )
           AND (
             ? = 1
             OR NOT EXISTS (SELECT 1 FROM developer_credentials)
           )`,
      )
      .bind(
        organizationId,
        organizationName,
        organizationSlug,
        now,
        userId,
        allowAdditional,
      ),
    db
      .prepare(
        `INSERT OR IGNORE INTO organization_members
          (id, organization_id, user_id, role, created_at)
         SELECT ?, ?, app_users.id, 'owner', ?
         FROM app_users
         INNER JOIN organizations ON organizations.id = ?
         WHERE app_users.id = ?
           AND app_users.email = ?
           AND NOT EXISTS (
             SELECT 1 FROM organization_members WHERE user_id = app_users.id
           )
           AND (
             ? = 1
             OR NOT EXISTS (SELECT 1 FROM developer_credentials)
           )`,
      )
      .bind(
        memberId,
        organizationId,
        now,
        organizationId,
        userId,
        normalizedEmail,
        allowAdditional,
      ),
    db
      .prepare(
        `INSERT INTO developer_credentials
          (user_id, password_hash, password_salt, password_iterations,
           created_at, updated_at)
         SELECT app_users.id, ?, ?, ?, ?, ?
         FROM app_users
         WHERE app_users.id = ?
           AND app_users.email = ?
           AND EXISTS (
             SELECT 1 FROM organization_members
             WHERE organization_members.user_id = app_users.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM developer_credentials
             WHERE developer_credentials.user_id = app_users.id
           )
           AND (
             ? = 1
             OR NOT EXISTS (SELECT 1 FROM developer_credentials)
           )`,
      )
      .bind(
        input.passwordHash,
        input.passwordSalt,
        input.passwordIterations,
        now,
        now,
        userId,
        normalizedEmail,
        allowAdditional,
      ),
  ]);

  if (results[5]?.meta.changes !== 1) {
    throw new ReviewConflictError(
      "Un compte avec cette adresse e-mail existe déjà.",
    );
  }

  const registeredUser = await db
    .prepare(
      "SELECT email, display_name FROM app_users WHERE id = ? LIMIT 1",
    )
    .bind(userId)
    .first<{ email: string; display_name: string }>();

  if (!registeredUser) {
    throw new Error("Le compte développeur n’a pas pu être relu.");
  }

  return {
    displayName: registeredUser.display_name,
    email: registeredUser.email,
  };
}

export async function createDeveloperSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<void> {
  await ensureDatabase();
  const now = new Date().toISOString();

  if (!/^[a-f0-9]{64}$/.test(input.tokenHash) || input.expiresAt <= now) {
    throw new ReviewConflictError("La session développeur est invalide.");
  }

  const result = await database()
    .prepare(
      `INSERT INTO developer_sessions
        (id, user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at)
       SELECT ?, developer_credentials.user_id, ?, ?, ?, ?, NULL
       FROM developer_credentials
       WHERE developer_credentials.user_id = ?
         AND ? > ?`,
    )
    .bind(
      `devsession_${crypto.randomUUID()}`,
      input.tokenHash,
      now,
      now,
      input.expiresAt,
      input.userId,
      input.expiresAt,
      now,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new ReviewForbiddenError(
      "Le compte développeur ne peut pas ouvrir de session.",
    );
  }
}

export async function getDeveloperIdentityBySessionHash(
  tokenHash: string,
): Promise<DeveloperIdentity | null> {
  await ensureDatabase();
  const db = database();
  const now = new Date().toISOString();
  const session = await db
    .prepare(
      `SELECT
         developer_sessions.id AS session_id,
         app_users.email,
         app_users.display_name
       FROM developer_sessions
       INNER JOIN app_users ON app_users.id = developer_sessions.user_id
       INNER JOIN developer_credentials
         ON developer_credentials.user_id = app_users.id
       WHERE developer_sessions.token_hash = ?
         AND developer_sessions.revoked_at IS NULL
         AND developer_sessions.expires_at > ?
       LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first<{
      session_id: string;
      email: string;
      display_name: string;
    }>();

  if (!session) {
    return null;
  }

  await db
    .prepare(
      `UPDATE developer_sessions
       SET last_seen_at = ?
       WHERE id = ?
         AND revoked_at IS NULL
         AND expires_at > ?
         AND last_seen_at < ?`,
    )
    .bind(
      now,
      session.session_id,
      now,
      new Date(Date.now() - 10 * 60 * 1_000).toISOString(),
    )
    .run();

  return {
    displayName: session.display_name,
    email: session.email,
  };
}

export async function revokeDeveloperSession(tokenHash: string): Promise<void> {
  await ensureDatabase();
  await database()
    .prepare(
      `UPDATE developer_sessions
       SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(new Date().toISOString(), tokenHash)
    .run();
}

export async function provisionDeveloper(
  identity: DeveloperIdentity,
): Promise<MemberContext> {
  await ensureDatabase();
  const db = database();
  const normalizedEmail = identity.email.trim().toLowerCase();
  const now = new Date().toISOString();
  let user = await db
    .prepare(
      "SELECT id, display_name FROM app_users WHERE email = ? LIMIT 1",
    )
    .bind(normalizedEmail)
    .first<{ id: string; display_name: string }>();

  if (!user) {
    const identityDigest = await sha256(normalizedEmail);
    const userId = `user_${identityDigest.slice(0, 32)}`;
    const organizationId = `org_${identityDigest.slice(0, 32)}`;
    const organizationName = `${identity.displayName.trim() || normalizedEmail} · Revaloop`;
    const organizationSlug = `${slugify(identity.displayName || normalizedEmail)}-${identityDigest.slice(0, 8)}`;
    const memberId = `member_${identityDigest.slice(0, 32)}`;

    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO app_users
            (id, email, display_name, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          normalizedEmail,
          identity.displayName.trim() || normalizedEmail,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO organizations (id, name, slug, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(organizationId, organizationName, organizationSlug, now),
      db
        .prepare(
          `INSERT OR IGNORE INTO organization_members
            (id, organization_id, user_id, role, created_at)
           VALUES (?, ?, ?, 'owner', ?)`,
        )
        .bind(memberId, organizationId, userId, now),
    ]);

    user = await db
      .prepare(
        "SELECT id, display_name FROM app_users WHERE email = ? LIMIT 1",
      )
      .bind(normalizedEmail)
      .first<{ id: string; display_name: string }>();

    if (!user) {
      throw new Error("Le compte développeur n’a pas pu être initialisé.");
    }
  }

  await db
    .prepare(
      `UPDATE app_users
       SET display_name = ?, last_seen_at = ?
       WHERE id = ?`,
    )
    .bind(identity.displayName.trim() || normalizedEmail, now, user.id)
    .run();

  const membership = await db
    .prepare(
      `SELECT
         organization_members.organization_id,
         organization_members.role,
         organizations.name AS organization_name
       FROM organization_members
       INNER JOIN organizations
         ON organizations.id = organization_members.organization_id
       WHERE organization_members.user_id = ?
       ORDER BY organization_members.created_at ASC
       LIMIT 1`,
    )
    .bind(user.id)
    .first<{
      organization_id: string;
      organization_name: string;
      role: "owner" | "developer";
    }>();

  if (!membership) {
    throw new ReviewForbiddenError(
      "Votre compte n’est rattaché à aucun espace Revaloop.",
    );
  }

  return {
    userId: user.id,
    organizationId: membership.organization_id,
    organizationName: membership.organization_name,
    role: membership.role,
    displayName: identity.displayName.trim() || normalizedEmail,
    email: normalizedEmail,
  };
}

async function getAuthorizedProject(
  member: MemberContext,
  projectId: string,
) {
  const row = await database()
    .prepare(
      `SELECT client_projects.*
       FROM client_projects
       INNER JOIN organization_members
         ON organization_members.organization_id = client_projects.organization_id
       WHERE client_projects.id = ?
         AND organization_members.user_id = ?
         AND organization_members.organization_id = ?
         AND client_projects.organization_id = ?
       LIMIT 1`,
    )
    .bind(
      projectId,
      member.userId,
      member.organizationId,
      member.organizationId,
    )
    .first<ProjectRow>();

  if (!row) {
    throw new ReviewNotFoundError("Projet introuvable.");
  }

  return row;
}

async function getAuthorizedRelease(
  member: MemberContext,
  releaseId: string,
) {
  const row = await database()
    .prepare(
      `SELECT review_releases.*, client_projects.organization_id
       FROM review_releases
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       INNER JOIN organization_members
         ON organization_members.organization_id = client_projects.organization_id
       WHERE review_releases.id = ?
         AND organization_members.user_id = ?
         AND organization_members.organization_id = ?
         AND client_projects.organization_id = ?
       LIMIT 1`,
    )
    .bind(
      releaseId,
      member.userId,
      member.organizationId,
      member.organizationId,
    )
    .first<ReleaseRow & { organization_id: string }>();

  if (!row) {
    throw new ReviewNotFoundError("Version introuvable.");
  }

  return row;
}

async function loadReviewPayload(input: {
  project: ProjectRow;
  release: ReleaseRow;
  reviewerName?: string;
  sessionId?: string;
}): Promise<ReviewPayloadWithMessages> {
  const db = database();
  const [
    feedbackResult,
    decisionResult,
    testResult,
    completionResult,
    messageResult,
  ] = await Promise.all([
      db
        .prepare(
          `SELECT * FROM review_feedback
           WHERE release_id = ?
           ORDER BY sequence ASC`,
        )
        .bind(input.release.id)
        .all<FeedbackRow>(),
      db
        .prepare(
          `SELECT * FROM review_decisions
           WHERE release_id = ?
           ORDER BY created_at DESC`,
        )
        .bind(input.release.id)
        .all<DecisionRow>(),
      db
        .prepare(
          `SELECT * FROM review_test_items
           WHERE release_id = ?
           ORDER BY position ASC`,
        )
        .bind(input.release.id)
        .all<TestItemRow>(),
      input.sessionId
        ? db
            .prepare(
              `SELECT review_test_completions.test_item_id
               FROM review_test_completions
               INNER JOIN review_test_items
                 ON review_test_items.id = review_test_completions.test_item_id
               WHERE review_test_completions.session_id = ?
                 AND review_test_items.release_id = ?`,
            )
            .bind(input.sessionId, input.release.id)
            .all<{ test_item_id: string }>()
        : Promise.resolve({ results: [] as { test_item_id: string }[] }),
      db
        .prepare(
          `SELECT *
           FROM release_messages
           WHERE release_id = ?
           ORDER BY created_at ASC, id ASC`,
        )
        .bind(input.release.id)
        .all<ReleaseMessageRow>(),
    ]);

  return {
    project: mapProject(input.project),
    release: mapRelease(input.release),
    feedback: feedbackResult.results.map(mapFeedback),
    decisions: decisionResult.results.map(mapDecision),
    testItems: testResult.results.map(mapTestItem),
    completedTestItemIds: completionResult.results.map(
      (row) => row.test_item_id,
    ),
    messages: messageResult.results.map(mapReleaseMessage),
    reviewerName: input.reviewerName,
  };
}

export async function getDeveloperWorkspace(
  identity: DeveloperIdentity,
  preferredProjectId?: string | null,
): Promise<
  DeveloperWorkspace & { activeReview: ReviewPayloadWithMessages | null }
> {
  const member = await provisionDeveloper(identity);
  const db = database();
  const projectResult = await db
    .prepare(
      `SELECT
         client_projects.*,
         review_releases.id AS latest_release_id,
         review_releases.version AS latest_release_version,
         review_releases.status AS latest_release_status,
         review_releases.updated_at AS latest_release_updated_at
       FROM client_projects
       LEFT JOIN review_releases
         ON review_releases.id = (
           SELECT candidate.id
           FROM review_releases AS candidate
           WHERE candidate.project_id = client_projects.id
           ORDER BY candidate.created_at DESC
           LIMIT 1
         )
       WHERE client_projects.organization_id = ?
       ORDER BY client_projects.updated_at DESC`,
    )
    .bind(member.organizationId)
    .all<
      ProjectRow & {
        latest_release_id: string | null;
        latest_release_version: string | null;
        latest_release_status: Release["status"] | null;
        latest_release_updated_at: string | null;
      }
    >();

  const projects: DeveloperProjectSummary[] = projectResult.results.map(
    (row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      accent: row.accent,
      updatedAt: row.updated_at,
      latestRelease:
        row.latest_release_id &&
        row.latest_release_version &&
        row.latest_release_status &&
        row.latest_release_updated_at
          ? {
              id: row.latest_release_id,
              version: row.latest_release_version,
              status: row.latest_release_status,
              updatedAt: row.latest_release_updated_at,
            }
          : null,
    }),
  );

  const activeProjectId =
    projects.find((project) => project.id === preferredProjectId)?.id ??
    projects[0]?.id;
  let activeReview: ReviewPayloadWithMessages | null = null;

  if (activeProjectId) {
    const project = await getAuthorizedProject(member, activeProjectId);
    const release = await db
      .prepare(
        `SELECT * FROM review_releases
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(project.id)
      .first<ReleaseRow>();

    if (release) {
      const invitation = await db
        .prepare(
          `SELECT reviewer_name
           FROM review_invitations
           WHERE release_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
        )
        .bind(release.id)
        .first<{ reviewer_name: string }>();

      activeReview = await loadReviewPayload({
        project,
        release,
        reviewerName: invitation?.reviewer_name,
      });
    }
  }

  return {
    viewer: {
      id: member.userId,
      displayName: member.displayName,
      email: member.email,
    },
    organization: {
      id: member.organizationId,
      name: member.organizationName,
    },
    projects,
    activeReview,
  };
}

export type ReleaseInput = {
  version: string;
  title: string;
  commitSha: string;
  previewUrl: string;
  reviewerMessage: string;
  testItems: Array<{ title: string; description: string }>;
  expiresAt: string;
};

async function insertReleaseStatements(input: {
  member: MemberContext;
  projectId: string;
  releaseId: string;
  release: ReleaseInput;
  now: string;
}) {
  const db = database();
  const statements = [
    db
      .prepare(
        `INSERT INTO review_releases
          (id, project_id, version, title, commit_sha, status, preview_kind,
           preview_url, reviewer_message, feedback_sequence, preview_revision,
           created_by,
           created_at, updated_at, expires_at, closed_at)
         VALUES (?, ?, ?, ?, ?, 'in_review', 'external', ?, ?, 0, 0, ?, ?, ?, ?, NULL)`,
      )
      .bind(
        input.releaseId,
        input.projectId,
        input.release.version,
        input.release.title,
        input.release.commitSha,
        input.release.previewUrl,
        input.release.reviewerMessage,
        input.member.userId,
        input.now,
        input.now,
        input.release.expiresAt,
      ),
    db
      .prepare(
        "UPDATE client_projects SET updated_at = ? WHERE id = ?",
      )
      .bind(input.now, input.projectId),
  ];

  for (const [position, item] of input.release.testItems.entries()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO review_test_items
            (id, release_id, position, title, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `test_${crypto.randomUUID()}`,
          input.releaseId,
          position,
          item.title,
          item.description,
          input.now,
        ),
    );
  }

  statements.push(
    await auditStatement({
      organizationId: input.member.organizationId,
      projectId: input.projectId,
      releaseId: input.releaseId,
      actorType: "developer",
      actorId: input.member.userId,
      action: "release.published",
      metadata: {
        version: input.release.version,
        previewKind: "external",
      },
    }),
  );

  return statements;
}

export async function createProjectWithRelease(
  identity: DeveloperIdentity,
  input: {
    name: string;
    description: string;
    accent: string;
    release: ReleaseInput;
  },
) {
  const member = await provisionDeveloper(identity);
  const db = database();
  const now = new Date().toISOString();
  const projectId = `project_${crypto.randomUUID()}`;
  const releaseId = `release_${crypto.randomUUID()}`;
  const projectSlug = `${slugify(input.name)}-${shortId()}`;
  const releaseStatements = await insertReleaseStatements({
    member,
    projectId,
    releaseId,
    release: input.release,
    now,
  });

  await db.batch([
    db
      .prepare(
        `INSERT INTO client_projects
          (id, organization_id, slug, name, description, accent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        projectId,
        member.organizationId,
        projectSlug,
        input.name,
        input.description,
        input.accent,
        now,
        now,
      ),
    ...releaseStatements,
  ]);

  return { projectId, releaseId };
}

export async function createRelease(
  identity: DeveloperIdentity,
  projectId: string,
  input: ReleaseInput,
) {
  const member = await provisionDeveloper(identity);
  await getAuthorizedProject(member, projectId);
  const releaseId = `release_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const activeRelease = await database()
    .prepare(
      `SELECT id
       FROM review_releases
       WHERE project_id = ?
         AND status IN ('in_review', 'changes_requested')
         AND expires_at > ?
       LIMIT 1`,
    )
    .bind(projectId, now)
    .first<{ id: string }>();

  if (activeRelease) {
    throw new ReviewConflictError(
      "La version actuelle doit être approuvée ou expirer avant d’en publier une nouvelle.",
    );
  }

  const statements = await insertReleaseStatements({
    member,
    projectId,
    releaseId,
    release: input,
    now,
  });

  try {
    await database().batch([
      database()
        .prepare(
          `UPDATE review_invitations
           SET revoked_at = ?
           WHERE revoked_at IS NULL
             AND release_id IN (
               SELECT id FROM review_releases
               WHERE project_id = ?
                 AND status IN ('in_review', 'changes_requested')
             )`,
        )
        .bind(now, projectId),
      database()
        .prepare(
          `UPDATE reviewer_sessions
           SET revoked_at = ?
           WHERE revoked_at IS NULL
             AND release_id IN (
               SELECT id FROM review_releases
               WHERE project_id = ?
                 AND status IN ('in_review', 'changes_requested')
             )`,
        )
        .bind(now, projectId),
      database()
        .prepare(
          `UPDATE review_releases
           SET status = 'superseded', closed_at = ?, updated_at = ?
           WHERE project_id = ?
             AND status IN ('in_review', 'changes_requested')`,
        )
        .bind(now, now, projectId),
      ...statements,
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /review_releases_project_version_unique|UNIQUE constraint/i.test(
        error.message,
      )
    ) {
      throw new ReviewConflictError(
        "Cette version existe déjà pour ce projet.",
      );
    }

    throw error;
  }

  return { projectId, releaseId };
}

export async function createInvitation(
  identity: DeveloperIdentity,
  input: {
    releaseId: string;
    reviewerName: string;
    reviewerEmail: string | null;
    expiresAt: string;
  },
): Promise<CreatedInvitation> {
  const member = await provisionDeveloper(identity);
  const db = database();
  const release = await db
    .prepare(
      `SELECT
         review_releases.*,
         client_projects.organization_id
       FROM review_releases
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       INNER JOIN organization_members
         ON organization_members.organization_id = client_projects.organization_id
       WHERE review_releases.id = ?
         AND organization_members.user_id = ?
         AND organization_members.organization_id = ?
         AND client_projects.organization_id = ?
       LIMIT 1`,
    )
    .bind(
      input.releaseId,
      member.userId,
      member.organizationId,
      member.organizationId,
    )
    .first<ReleaseRow & { organization_id: string }>();

  if (!release) {
    throw new ReviewNotFoundError("Version introuvable.");
  }

  if (
    release.status !== "in_review" &&
    release.status !== "changes_requested"
  ) {
    throw new ReviewConflictError(
      "Une version clôturée ne peut plus recevoir de nouvelle invitation.",
    );
  }

  assertActiveDate(release.expires_at, "Cette version a expiré.");
  const secret = generateSecret();
  const tokenHash = await sha256(secret);
  const invitationId = `invite_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const expiresAt =
    Date.parse(input.expiresAt) < Date.parse(release.expires_at)
      ? input.expiresAt
      : release.expires_at;

  await db.batch([
    db
      .prepare(
        `UPDATE review_invitations
         SET revoked_at = ?
         WHERE release_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, release.id),
    db
      .prepare(
        `UPDATE reviewer_sessions
         SET revoked_at = ?
         WHERE release_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, release.id),
    db
      .prepare(
        `INSERT INTO review_invitations
          (id, release_id, token_hash, reviewer_name, reviewer_email, created_by,
           created_at, expires_at, used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .bind(
        invitationId,
        release.id,
        tokenHash,
        input.reviewerName,
        input.reviewerEmail,
        member.userId,
        now,
        expiresAt,
      ),
    await auditStatement({
      organizationId: release.organization_id,
      projectId: release.project_id,
      releaseId: release.id,
      actorType: "developer",
      actorId: member.userId,
      action: "invitation.created",
      metadata: { invitationId, expiresAt },
    }),
  ]);

  return {
    invitationId,
    releaseId: release.id,
    secret,
    expiresAt,
  };
}

export async function revokeReleaseAccess(
  identity: DeveloperIdentity,
  releaseId: string,
) {
  const member = await provisionDeveloper(identity);
  const db = database();
  const release = await db
    .prepare(
      `SELECT
         review_releases.id,
         review_releases.project_id,
         client_projects.organization_id
       FROM review_releases
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       INNER JOIN organization_members
         ON organization_members.organization_id = client_projects.organization_id
       WHERE review_releases.id = ?
         AND organization_members.user_id = ?
         AND organization_members.organization_id = ?
         AND client_projects.organization_id = ?
       LIMIT 1`,
    )
    .bind(
      releaseId,
      member.userId,
      member.organizationId,
      member.organizationId,
    )
    .first<{
      id: string;
      project_id: string;
      organization_id: string;
    }>();

  if (!release) {
    throw new ReviewNotFoundError("Version introuvable.");
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE review_invitations
         SET revoked_at = ?
         WHERE release_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, releaseId),
    db
      .prepare(
        `UPDATE reviewer_sessions
         SET revoked_at = ?
         WHERE release_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, releaseId),
    await auditStatement({
      organizationId: release.organization_id,
      projectId: release.project_id,
      releaseId,
      actorType: "developer",
      actorId: member.userId,
      action: "invitation.revoked",
    }),
  ]);
}

export async function revokeReviewerSession(
  releaseId: string,
  sessionToken: string,
) {
  await ensureDatabase();
  const db = database();
  const sessionHash = await sha256(sessionToken);
  const session = await db
    .prepare(
      `SELECT
         reviewer_sessions.id,
         client_projects.id AS project_id,
         client_projects.organization_id
       FROM reviewer_sessions
       INNER JOIN review_releases
         ON review_releases.id = reviewer_sessions.release_id
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       WHERE reviewer_sessions.release_id = ?
         AND reviewer_sessions.token_hash = ?
       LIMIT 1`,
    )
    .bind(releaseId, sessionHash)
    .first<{
      id: string;
      project_id: string;
      organization_id: string;
    }>();

  if (!session) {
    return;
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE reviewer_sessions
         SET revoked_at = ?
         WHERE id = ? AND revoked_at IS NULL`,
      )
      .bind(now, session.id),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, 'reviewer', ?, 'session.revoked', '{}', ?
         WHERE EXISTS (
           SELECT 1 FROM reviewer_sessions
           WHERE id = ? AND revoked_at = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        session.organization_id,
        session.project_id,
        releaseId,
        session.id,
        now,
        session.id,
        now,
      ),
  ]);
}

export async function exchangeInvitation(secret: string) {
  await ensureDatabase();
  const db = database();
  const now = new Date().toISOString();
  const tokenHash = await sha256(secret);
  const invitation = await db
    .prepare(
      `SELECT
         review_invitations.id,
         review_invitations.release_id,
         review_invitations.reviewer_name,
         review_invitations.expires_at
       FROM review_invitations
       INNER JOIN review_releases
         ON review_releases.id = review_invitations.release_id
       WHERE review_invitations.token_hash = ?
         AND used_at IS NULL
         AND review_invitations.revoked_at IS NULL
         AND review_invitations.expires_at > ?
         AND review_releases.expires_at > ?
         AND review_releases.status IN ('in_review', 'changes_requested')
       LIMIT 1`,
    )
    .bind(tokenHash, now, now)
    .first<InvitationExchangeRow>();

  if (!invitation) {
    return null;
  }

  const sessionToken = generateSecret();
  const sessionHash = await sha256(sessionToken);
  const sessionId = `session_${crypto.randomUUID()}`;
  const sessionExpiresAt = new Date(
    Math.min(
      Date.parse(invitation.expires_at),
      Date.now() + 24 * 60 * 60 * 1_000,
    ),
  ).toISOString();
  const [sessionResult] = await db.batch([
    db
      .prepare(
        `INSERT INTO reviewer_sessions
          (id, invitation_id, release_id, token_hash, reviewer_name, created_at,
           last_seen_at, expires_at, revoked_at)
         SELECT ?, invitation.id, invitation.release_id, ?,
                invitation.reviewer_name, ?, ?, ?, NULL
         FROM review_invitations AS invitation
         INNER JOIN review_releases
           ON review_releases.id = invitation.release_id
         WHERE invitation.id = ?
           AND invitation.token_hash = ?
           AND invitation.used_at IS NULL
           AND invitation.revoked_at IS NULL
           AND invitation.expires_at > ?
           AND review_releases.expires_at > ?
           AND review_releases.status IN ('in_review', 'changes_requested')`,
      )
      .bind(
        sessionId,
        sessionHash,
        now,
        now,
        sessionExpiresAt,
        invitation.id,
        tokenHash,
        now,
        now,
      ),
    db
      .prepare(
        `UPDATE review_invitations
         SET used_at = ?
         WHERE id = ?
           AND used_at IS NULL
           AND EXISTS (
             SELECT 1 FROM reviewer_sessions
             WHERE reviewer_sessions.id = ?
               AND reviewer_sessions.invitation_id = review_invitations.id
           )`,
      )
      .bind(now, invitation.id, sessionId),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, client_projects.organization_id, client_projects.id,
                review_releases.id, 'reviewer', ?, 'invitation.exchanged',
                '{}', ?
         FROM reviewer_sessions
         INNER JOIN review_releases
           ON review_releases.id = reviewer_sessions.release_id
         INNER JOIN client_projects
           ON client_projects.id = review_releases.project_id
         WHERE reviewer_sessions.id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        sessionId,
        now,
        sessionId,
      ),
  ]);

  if (sessionResult.meta.changes !== 1) {
    return null;
  }

  return {
    releaseId: invitation.release_id,
    sessionToken,
    sessionId,
    expiresAt: sessionExpiresAt,
  };
}

async function getReviewerAccess(
  releaseId: string,
  sessionToken: string,
): Promise<ReviewerAccessRow | null> {
  await ensureDatabase();
  const now = new Date().toISOString();
  const sessionHash = await sha256(sessionToken);

  return database()
    .prepare(
      `SELECT
         reviewer_sessions.id AS session_id,
         reviewer_sessions.invitation_id,
         reviewer_sessions.release_id,
         reviewer_sessions.reviewer_name,
         reviewer_sessions.expires_at AS session_expires_at,
         review_invitations.expires_at AS invitation_expires_at,
         review_releases.expires_at AS release_expires_at,
         client_projects.organization_id,
         client_projects.id AS project_id
       FROM reviewer_sessions
       INNER JOIN review_invitations
         ON review_invitations.id = reviewer_sessions.invitation_id
        AND review_invitations.release_id = reviewer_sessions.release_id
       INNER JOIN review_releases
         ON review_releases.id = reviewer_sessions.release_id
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       WHERE reviewer_sessions.token_hash = ?
         AND reviewer_sessions.release_id = ?
         AND reviewer_sessions.revoked_at IS NULL
         AND review_invitations.revoked_at IS NULL
         AND reviewer_sessions.expires_at > ?
         AND review_invitations.expires_at > ?
         AND review_releases.expires_at > ?
       LIMIT 1`,
    )
    .bind(sessionHash, releaseId, now, now, now)
    .first<ReviewerAccessRow>();
}

export async function listReleaseMessagesForDeveloper(
  identity: DeveloperIdentity,
  releaseId: string,
): Promise<ReleaseMessage[]> {
  const member = await provisionDeveloper(identity);
  const release = await getAuthorizedRelease(member, releaseId);
  const result = await database()
    .prepare(
      `SELECT *
       FROM release_messages
       WHERE release_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(release.id)
    .all<ReleaseMessageRow>();

  return result.results.map(mapReleaseMessage);
}

export async function listReleaseMessagesForReviewer(
  releaseId: string,
  sessionToken: string,
): Promise<ReleaseMessage[]> {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    throw new ReviewForbiddenError("Session de recette invalide.");
  }

  const result = await database()
    .prepare(
      `SELECT *
       FROM release_messages
       WHERE release_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(access.release_id)
    .all<ReleaseMessageRow>();

  return result.results.map(mapReleaseMessage);
}

export async function createReleaseMessageAsDeveloper(
  identity: DeveloperIdentity,
  releaseId: string,
  body: string,
): Promise<ReleaseMessage> {
  const member = await provisionDeveloper(identity);
  const release = await getAuthorizedRelease(member, releaseId);
  const db = database();
  const messageId = `message_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const [insertResult] = await db.batch([
    db
      .prepare(
        `INSERT INTO release_messages
          (id, release_id, author_type, author_user_id, author_session_id,
           author_name, body, created_at)
         SELECT ?, review_releases.id, 'developer', ?, NULL, ?, ?, ?
         FROM review_releases
         INNER JOIN client_projects
           ON client_projects.id = review_releases.project_id
         INNER JOIN organization_members
           ON organization_members.organization_id = client_projects.organization_id
         WHERE review_releases.id = ?
           AND review_releases.status IN ('in_review', 'changes_requested')
           AND review_releases.expires_at > ?
           AND organization_members.user_id = ?
           AND organization_members.organization_id = ?
           AND client_projects.organization_id = ?`,
      )
      .bind(
        messageId,
        member.userId,
        member.displayName,
        body,
        now,
        release.id,
        now,
        member.userId,
        member.organizationId,
        member.organizationId,
      ),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, 'developer', ?, 'message.created', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM release_messages WHERE id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        member.organizationId,
        release.project_id,
        release.id,
        member.userId,
        JSON.stringify({ messageId }),
        now,
        messageId,
      ),
  ]);

  if (insertResult.meta.changes !== 1) {
    throw new ReviewConflictError(
      "Cette version est clôturée, expirée ou n’est plus accessible.",
    );
  }

  const row = await db
    .prepare("SELECT * FROM release_messages WHERE id = ? LIMIT 1")
    .bind(messageId)
    .first<ReleaseMessageRow>();

  if (!row) {
    throw new ReviewConflictError("Le message n’a pas pu être enregistré.");
  }

  return mapReleaseMessage(row);
}

export async function createReleaseMessageAsReviewer(
  releaseId: string,
  sessionToken: string,
  body: string,
): Promise<ReleaseMessage> {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    throw new ReviewForbiddenError("Session de recette invalide.");
  }

  const db = database();
  const messageId = `message_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const sessionHash = await sha256(sessionToken);
  const [insertResult] = await db.batch([
    db
      .prepare(
        `INSERT INTO release_messages
          (id, release_id, author_type, author_user_id, author_session_id,
           author_name, body, created_at)
         SELECT ?, review_releases.id, 'reviewer', NULL, ?, ?, ?, ?
         FROM review_releases
         WHERE review_releases.id = ?
           AND review_releases.status IN ('in_review', 'changes_requested')
           AND review_releases.expires_at > ?
           AND EXISTS (
             SELECT 1
             FROM reviewer_sessions
             INNER JOIN review_invitations
               ON review_invitations.id = reviewer_sessions.invitation_id
              AND review_invitations.release_id = reviewer_sessions.release_id
             WHERE reviewer_sessions.id = ?
               AND reviewer_sessions.token_hash = ?
               AND reviewer_sessions.release_id = review_releases.id
               AND reviewer_sessions.revoked_at IS NULL
               AND review_invitations.revoked_at IS NULL
               AND reviewer_sessions.expires_at > ?
               AND review_invitations.expires_at > ?
           )`,
      )
      .bind(
        messageId,
        access.session_id,
        access.reviewer_name,
        body,
        now,
        releaseId,
        now,
        access.session_id,
        sessionHash,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, 'reviewer', ?, 'message.created', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM release_messages WHERE id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        access.organization_id,
        access.project_id,
        releaseId,
        access.session_id,
        JSON.stringify({ messageId }),
        now,
        messageId,
      ),
  ]);

  if (insertResult.meta.changes !== 1) {
    throw new ReviewConflictError(
      "Cette version est clôturée ou la session vient d’être révoquée.",
    );
  }

  const row = await db
    .prepare("SELECT * FROM release_messages WHERE id = ? LIMIT 1")
    .bind(messageId)
    .first<ReleaseMessageRow>();

  if (!row) {
    throw new ReviewConflictError("Le message n’a pas pu être enregistré.");
  }

  return mapReleaseMessage(row);
}

export async function incrementPreviewRevision(
  identity: DeveloperIdentity,
  releaseId: string,
) {
  const member = await provisionDeveloper(identity);
  const release = await getAuthorizedRelease(member, releaseId);
  const db = database();
  const now = new Date().toISOString();
  const [revisionResult] = await db.batch([
    db
      .prepare(
        `UPDATE review_releases
         SET preview_revision = preview_revision + 1, updated_at = ?
         WHERE id = ?
           AND status IN ('in_review', 'changes_requested')
           AND expires_at > ?
           AND EXISTS (
             SELECT 1
             FROM client_projects
             INNER JOIN organization_members
               ON organization_members.organization_id =
                  client_projects.organization_id
             WHERE client_projects.id = review_releases.project_id
               AND organization_members.user_id = ?
               AND organization_members.organization_id = ?
               AND client_projects.organization_id = ?
           )
         RETURNING preview_revision`,
      )
      .bind(
        now,
        release.id,
        now,
        member.userId,
        member.organizationId,
        member.organizationId,
      ),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, 'developer', ?, 'preview.revised', '{}', ?
         FROM review_releases
         WHERE review_releases.id = ?
           AND review_releases.updated_at = ?`,
      )
      .bind(
        crypto.randomUUID(),
        member.organizationId,
        release.project_id,
        release.id,
        member.userId,
        now,
        release.id,
        now,
      ),
  ]);
  const revision = (
    revisionResult.results[0] as { preview_revision: number } | undefined
  )?.preview_revision;

  if (typeof revision !== "number") {
    throw new ReviewConflictError(
      "Cette version est clôturée, expirée ou n’est plus accessible.",
    );
  }

  return {
    releaseId: release.id,
    previewRevision: revision,
    updatedAt: now,
  };
}

export async function getReviewForReviewer(
  releaseId: string,
  sessionToken: string,
): Promise<ReviewPayloadWithMessages | null> {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    return null;
  }

  const db = database();
  const [project, release] = await Promise.all([
    db
      .prepare("SELECT * FROM client_projects WHERE id = ? LIMIT 1")
      .bind(access.project_id)
      .first<ProjectRow>(),
    db
      .prepare("SELECT * FROM review_releases WHERE id = ? LIMIT 1")
      .bind(access.release_id)
      .first<ReleaseRow>(),
  ]);

  if (!project || !release) {
    return null;
  }

  await db
    .prepare(
      `UPDATE reviewer_sessions
       SET last_seen_at = ?
       WHERE id = ? AND last_seen_at < ?`,
    )
    .bind(
      new Date().toISOString(),
      access.session_id,
      new Date(Date.now() - 10 * 60 * 1_000).toISOString(),
    )
    .run();

  return loadReviewPayload({
    project,
    release,
    reviewerName: access.reviewer_name,
    sessionId: access.session_id,
  });
}

export async function createFeedbackAsReviewer(
  releaseId: string,
  sessionToken: string,
  input: {
    type: FeedbackType;
    title: string;
    body: string;
    priority: FeedbackPriority;
    pagePath: string;
    pageTitle: string;
    viewport: string;
    positionX: number | null;
    positionY: number | null;
  },
) {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    throw new ReviewForbiddenError("Session de recette invalide.");
  }

  const db = database();
  const now = new Date().toISOString();
  const sessionHash = await sha256(sessionToken);
  const feedbackId = `feedback_${crypto.randomUUID()}`;
  const [, insertResult] = await db.batch([
    db
      .prepare(
        `UPDATE review_releases
         SET feedback_sequence = feedback_sequence + 1, updated_at = ?
         WHERE id = ?
           AND status IN ('in_review', 'changes_requested')
           AND expires_at > ?
           AND EXISTS (
             SELECT 1
             FROM reviewer_sessions
             INNER JOIN review_invitations
               ON review_invitations.id = reviewer_sessions.invitation_id
              AND review_invitations.release_id = reviewer_sessions.release_id
             WHERE reviewer_sessions.id = ?
               AND reviewer_sessions.token_hash = ?
               AND reviewer_sessions.release_id = review_releases.id
               AND reviewer_sessions.revoked_at IS NULL
               AND review_invitations.revoked_at IS NULL
               AND reviewer_sessions.expires_at > ?
               AND review_invitations.expires_at > ?
           )`,
      )
      .bind(
        now,
        releaseId,
        now,
        access.session_id,
        sessionHash,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO review_feedback
          (id, release_id, author_session_id, sequence, type, title, body,
           status, priority, page_path, page_title, viewport, position_x,
           position_y, author_name, created_at, updated_at)
         SELECT ?, review_releases.id, ?, review_releases.feedback_sequence,
                ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM review_releases
         WHERE review_releases.id = ?
           AND review_releases.status IN ('in_review', 'changes_requested')
           AND review_releases.expires_at > ?
           AND review_releases.updated_at = ?
           AND EXISTS (
             SELECT 1
             FROM reviewer_sessions
             INNER JOIN review_invitations
               ON review_invitations.id = reviewer_sessions.invitation_id
              AND review_invitations.release_id = reviewer_sessions.release_id
             WHERE reviewer_sessions.id = ?
               AND reviewer_sessions.token_hash = ?
               AND reviewer_sessions.release_id = review_releases.id
               AND reviewer_sessions.revoked_at IS NULL
               AND review_invitations.revoked_at IS NULL
               AND reviewer_sessions.expires_at > ?
               AND review_invitations.expires_at > ?
           )`,
      )
      .bind(
        feedbackId,
        access.session_id,
        input.type,
        input.title,
        input.body,
        input.priority,
        input.pagePath,
        input.pageTitle,
        input.viewport,
        input.positionX,
        input.positionY,
        access.reviewer_name,
        now,
        now,
        releaseId,
        now,
        now,
        access.session_id,
        sessionHash,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, 'reviewer', ?, 'feedback.created', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM review_feedback WHERE id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        access.organization_id,
        access.project_id,
        releaseId,
        access.session_id,
        JSON.stringify({ feedbackId }),
        now,
        feedbackId,
      ),
  ]);

  if (insertResult.meta.changes !== 1) {
    throw new ReviewConflictError(
      "Cette version est clôturée ou la session vient d’être révoquée.",
    );
  }

  const item = await db
    .prepare("SELECT * FROM review_feedback WHERE id = ? LIMIT 1")
    .bind(feedbackId)
    .first<FeedbackRow>();

  if (!item) {
    throw new ReviewConflictError("Le retour n’a pas pu être enregistré.");
  }

  return mapFeedback(item);
}

const developerTransitions: Partial<
  Record<FeedbackStatus, FeedbackStatus[]>
> = {
  open: ["in_progress"],
  in_progress: ["to_review"],
};

const reviewerTransitions: Partial<
  Record<FeedbackStatus, FeedbackStatus[]>
> = {
  to_review: ["open", "resolved"],
  resolved: ["open"],
};

export async function updateFeedbackAsDeveloper(
  identity: DeveloperIdentity,
  id: string,
  status: FeedbackStatus,
) {
  const member = await provisionDeveloper(identity);
  const db = database();
  const current = await db
    .prepare(
      `SELECT
         review_feedback.*,
         review_releases.status AS release_status,
         review_releases.expires_at AS release_expires_at,
         review_releases.project_id,
         client_projects.organization_id
       FROM review_feedback
       INNER JOIN review_releases
         ON review_releases.id = review_feedback.release_id
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       INNER JOIN organization_members
         ON organization_members.organization_id = client_projects.organization_id
       WHERE review_feedback.id = ?
         AND organization_members.user_id = ?
         AND organization_members.organization_id = ?
         AND client_projects.organization_id = ?
       LIMIT 1`,
    )
    .bind(
      id,
      member.userId,
      member.organizationId,
      member.organizationId,
    )
    .first<FeedbackAccessRow>();

  if (!current) {
    throw new ReviewNotFoundError("Retour introuvable.");
  }

  if (
    !["in_review", "changes_requested"].includes(current.release_status) ||
    !(developerTransitions[current.status] ?? []).includes(status)
  ) {
    throw new ReviewConflictError("Cette transition développeur est refusée.");
  }

  assertActiveDate(current.release_expires_at);
  return applyFeedbackTransition({
    current,
    status,
    actorType: "developer",
    actorId: member.userId,
  });
}

export async function updateFeedbackAsReviewer(
  releaseId: string,
  sessionToken: string,
  id: string,
  status: FeedbackStatus,
) {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    throw new ReviewForbiddenError("Session de recette invalide.");
  }

  const current = await database()
    .prepare(
      `SELECT
         review_feedback.*,
         review_releases.status AS release_status,
         review_releases.expires_at AS release_expires_at,
         review_releases.project_id,
         client_projects.organization_id
       FROM review_feedback
       INNER JOIN review_releases
         ON review_releases.id = review_feedback.release_id
       INNER JOIN client_projects
         ON client_projects.id = review_releases.project_id
       WHERE review_feedback.id = ?
         AND review_feedback.release_id = ?
       LIMIT 1`,
    )
    .bind(id, releaseId)
    .first<FeedbackAccessRow>();

  if (!current) {
    throw new ReviewNotFoundError("Retour introuvable.");
  }

  if (
    !["in_review", "changes_requested"].includes(current.release_status) ||
    !(reviewerTransitions[current.status] ?? []).includes(status)
  ) {
    throw new ReviewConflictError("Cette transition cliente est refusée.");
  }

  return applyFeedbackTransition({
    current,
    status,
    actorType: "reviewer",
    actorId: access.session_id,
    reviewerSessionHash: await sha256(sessionToken),
  });
}

async function applyFeedbackTransition(input: {
  current: FeedbackAccessRow;
  status: FeedbackStatus;
  actorType: "developer" | "reviewer";
  actorId: string;
  reviewerSessionHash?: string;
}) {
  const db = database();
  const updatedAt = new Date().toISOString();
  const updateStatement =
    input.actorType === "reviewer" && input.reviewerSessionHash
      ? db
          .prepare(
            `UPDATE review_feedback
             SET status = ?, updated_at = ?
             WHERE id = ? AND release_id = ? AND status = ?
               AND EXISTS (
                 SELECT 1
                 FROM review_releases
                 WHERE review_releases.id = review_feedback.release_id
                   AND review_releases.status IN ('in_review', 'changes_requested')
                   AND review_releases.expires_at > ?
               )
               AND EXISTS (
                 SELECT 1
                 FROM reviewer_sessions
                 INNER JOIN review_invitations
                   ON review_invitations.id = reviewer_sessions.invitation_id
                  AND review_invitations.release_id = reviewer_sessions.release_id
                 WHERE reviewer_sessions.id = ?
                   AND reviewer_sessions.token_hash = ?
                   AND reviewer_sessions.release_id = review_feedback.release_id
                   AND reviewer_sessions.revoked_at IS NULL
                   AND review_invitations.revoked_at IS NULL
                   AND reviewer_sessions.expires_at > ?
                   AND review_invitations.expires_at > ?
               )`,
          )
          .bind(
            input.status,
            updatedAt,
            input.current.id,
            input.current.release_id,
            input.current.status,
            updatedAt,
            input.actorId,
            input.reviewerSessionHash,
            updatedAt,
            updatedAt,
          )
      : db
          .prepare(
            `UPDATE review_feedback
             SET status = ?, updated_at = ?
             WHERE id = ? AND release_id = ? AND status = ?
               AND EXISTS (
                 SELECT 1
                 FROM review_releases
                 WHERE review_releases.id = review_feedback.release_id
                   AND review_releases.status IN ('in_review', 'changes_requested')
                   AND review_releases.expires_at > ?
               )`,
          )
          .bind(
            input.status,
            updatedAt,
            input.current.id,
            input.current.release_id,
            input.current.status,
            updatedAt,
          );
  const [result] = await db.batch([
    updateStatement,
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, 'feedback.status_changed', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM review_feedback
           WHERE id = ? AND status = ? AND updated_at = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        input.current.organization_id,
        input.current.project_id,
        input.current.release_id,
        input.actorType,
        input.actorId,
        JSON.stringify({
          feedbackId: input.current.id,
          from: input.current.status,
          to: input.status,
        }),
        updatedAt,
        input.current.id,
        input.status,
        updatedAt,
      ),
  ]);

  if (result.meta.changes !== 1) {
    throw new ReviewConflictError(
      "Le statut a changé entre-temps. Rechargez la recette.",
    );
  }

  const row = await db
    .prepare("SELECT * FROM review_feedback WHERE id = ? LIMIT 1")
    .bind(input.current.id)
    .first<FeedbackRow>();

  if (!row) {
    throw new ReviewNotFoundError("Retour introuvable.");
  }

  return mapFeedback(row);
}

export async function createDecisionAsReviewer(
  releaseId: string,
  sessionToken: string,
  input: {
    status: ReviewDecision["status"];
    note: string;
  },
) {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    throw new ReviewForbiddenError("Session de recette invalide.");
  }

  const db = database();
  const now = new Date().toISOString();
  const sessionHash = await sha256(sessionToken);
  const decision: ReviewDecision = {
    id: `decision_${crypto.randomUUID()}`,
    releaseId,
    status: input.status,
    authorName: access.reviewer_name,
    note: input.note,
    createdAt: now,
  };
  const [insertResult] = await db.batch([
    db
      .prepare(
        `INSERT INTO review_decisions
          (id, release_id, reviewer_session_id, status, author_name, note, created_at)
         SELECT ?, review_releases.id, ?, ?, ?, ?, ?
         FROM review_releases
         WHERE review_releases.id = ?
           AND review_releases.status IN ('in_review', 'changes_requested')
           AND review_releases.expires_at > ?
           AND (
             ? != 'approved'
             OR NOT EXISTS (
               SELECT 1 FROM review_feedback
               WHERE review_feedback.release_id = review_releases.id
                 AND review_feedback.status != 'resolved'
             )
           )
           AND EXISTS (
             SELECT 1
             FROM reviewer_sessions
             INNER JOIN review_invitations
               ON review_invitations.id = reviewer_sessions.invitation_id
              AND review_invitations.release_id = reviewer_sessions.release_id
             WHERE reviewer_sessions.id = ?
               AND reviewer_sessions.token_hash = ?
               AND reviewer_sessions.release_id = review_releases.id
               AND reviewer_sessions.revoked_at IS NULL
               AND review_invitations.revoked_at IS NULL
               AND reviewer_sessions.expires_at > ?
               AND review_invitations.expires_at > ?
           )
         ON CONFLICT(release_id) DO UPDATE SET
           id = excluded.id,
           reviewer_session_id = excluded.reviewer_session_id,
           status = excluded.status,
           author_name = excluded.author_name,
           note = excluded.note,
           created_at = excluded.created_at
         WHERE review_decisions.status = 'changes_requested'`,
      )
      .bind(
        decision.id,
        access.session_id,
        decision.status,
        decision.authorName,
        decision.note,
        decision.createdAt,
        releaseId,
        now,
        decision.status,
        access.session_id,
        sessionHash,
        now,
        now,
      ),
    db
      .prepare(
        `UPDATE review_releases
         SET status = ?,
             closed_at = CASE WHEN ? = 'approved' THEN ? ELSE NULL END,
             updated_at = ?
         WHERE id = ?
           AND status IN ('in_review', 'changes_requested')
           AND EXISTS (
             SELECT 1 FROM review_decisions
             WHERE review_decisions.id = ?
               AND review_decisions.release_id = review_releases.id
           )`,
      )
      .bind(
        decision.status,
        decision.status,
        now,
        now,
        releaseId,
        decision.id,
      ),
    db
      .prepare(
        `INSERT INTO audit_events
          (id, organization_id, project_id, release_id, actor_type, actor_id,
           action, metadata_json, created_at)
         SELECT ?, ?, ?, ?, 'reviewer', ?, 'decision.created', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM review_decisions WHERE id = ?
         )`,
      )
      .bind(
        crypto.randomUUID(),
        access.organization_id,
        access.project_id,
        releaseId,
        access.session_id,
        JSON.stringify({ status: decision.status }),
        now,
        decision.id,
      ),
  ]);

  if (insertResult.meta.changes !== 1) {
    if (input.status === "approved") {
      const unresolved = await db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM review_feedback
           WHERE release_id = ? AND status != 'resolved'`,
        )
        .bind(releaseId)
        .first<{ count: number }>();

      if ((unresolved?.count ?? 0) > 0) {
        throw new ReviewConflictError(
          "La version ne peut pas être approuvée tant que des retours restent ouverts.",
        );
      }
    }

    throw new ReviewConflictError(
      "Cette version est déjà approuvée ou n’est plus active.",
    );
  }

  return decision;
}

export async function setTestItemCompletion(
  releaseId: string,
  sessionToken: string,
  testItemId: string,
  completed: boolean,
) {
  const access = await getReviewerAccess(releaseId, sessionToken);

  if (!access) {
    throw new ReviewForbiddenError("Session de recette invalide.");
  }

  const item = await database()
    .prepare(
      `SELECT id FROM review_test_items
       WHERE id = ? AND release_id = ?
       LIMIT 1`,
    )
    .bind(testItemId, releaseId)
    .first<{ id: string }>();

  if (!item) {
    throw new ReviewNotFoundError("Point de vérification introuvable.");
  }

  const db = database();
  const now = new Date().toISOString();
  const sessionHash = await sha256(sessionToken);

  if (completed) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO review_test_completions
          (id, session_id, test_item_id, completed_at)
         SELECT ?, ?, review_test_items.id, ?
         FROM review_test_items
         INNER JOIN review_releases
           ON review_releases.id = review_test_items.release_id
         WHERE review_test_items.id = ?
           AND review_test_items.release_id = ?
           AND review_releases.status IN ('in_review', 'changes_requested')
           AND review_releases.expires_at > ?
           AND EXISTS (
             SELECT 1
             FROM reviewer_sessions
             INNER JOIN review_invitations
               ON review_invitations.id = reviewer_sessions.invitation_id
              AND review_invitations.release_id = reviewer_sessions.release_id
             WHERE reviewer_sessions.id = ?
               AND reviewer_sessions.token_hash = ?
               AND reviewer_sessions.release_id = review_releases.id
               AND reviewer_sessions.revoked_at IS NULL
               AND review_invitations.revoked_at IS NULL
               AND reviewer_sessions.expires_at > ?
               AND review_invitations.expires_at > ?
           )`,
      )
      .bind(
        `completion_${crypto.randomUUID()}`,
        access.session_id,
        now,
        testItemId,
        releaseId,
        now,
        access.session_id,
        sessionHash,
        now,
        now,
      )
      .run();
  } else {
    await db
      .prepare(
        `DELETE FROM review_test_completions
         WHERE session_id = ? AND test_item_id = ?
           AND EXISTS (
             SELECT 1
             FROM review_releases
             INNER JOIN reviewer_sessions
               ON reviewer_sessions.release_id = review_releases.id
             INNER JOIN review_invitations
               ON review_invitations.id = reviewer_sessions.invitation_id
              AND review_invitations.release_id = reviewer_sessions.release_id
             WHERE review_releases.id = ?
               AND review_releases.status IN ('in_review', 'changes_requested')
               AND review_releases.expires_at > ?
               AND reviewer_sessions.id = ?
               AND reviewer_sessions.token_hash = ?
               AND reviewer_sessions.revoked_at IS NULL
               AND review_invitations.revoked_at IS NULL
               AND reviewer_sessions.expires_at > ?
               AND review_invitations.expires_at > ?
           )`,
      )
      .bind(
        access.session_id,
        testItemId,
        releaseId,
        now,
        access.session_id,
        sessionHash,
        now,
        now,
      )
      .run();
  }

  const persisted = await db
    .prepare(
      `SELECT 1 AS present
       FROM review_test_completions
       WHERE session_id = ? AND test_item_id = ?
       LIMIT 1`,
    )
    .bind(access.session_id, testItemId)
    .first<{ present: number }>();

  if (Boolean(persisted) !== completed) {
    throw new ReviewConflictError(
      "Cette version est clôturée ou la session vient d’être révoquée.",
    );
  }

  return { testItemId, completed };
}

export async function deleteProject(
  identity: DeveloperIdentity,
  projectId: string,
) {
  const member = await provisionDeveloper(identity);

  if (member.role !== "owner") {
    throw new ReviewForbiddenError(
      "Seul le propriétaire peut supprimer un projet.",
    );
  }

  const project = await getAuthorizedProject(member, projectId);
  await database().batch([
    await auditStatement({
      organizationId: member.organizationId,
      projectId: project.id,
      actorType: "developer",
      actorId: member.userId,
      action: "project.deleted",
      metadata: { projectId: project.id },
    }),
    database()
      .prepare(
        `DELETE FROM client_projects
         WHERE id = ? AND organization_id = ?`,
      )
      .bind(project.id, member.organizationId),
  ]);
}

export async function consumeRateLimit(input: {
  namespace: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}) {
  await ensureDatabase();
  const nowMs = Date.now();
  const windowStart =
    Math.floor(nowMs / (input.windowSeconds * 1_000)) *
    input.windowSeconds *
    1_000;
  const expiresAt = new Date(
    windowStart + input.windowSeconds * 1_000,
  ).toISOString();
  const identifierHash = await sha256(input.identifier);
  const key = `${input.namespace}:${windowStart}:${identifierHash.slice(0, 24)}`;
  const row = await database()
    .prepare(
      `INSERT INTO rate_limit_buckets (key, count, expires_at)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, expiresAt)
    .first<{ count: number }>();

  if ((row?.count ?? input.limit + 1) > input.limit) {
    const retryAfter = Math.max(
      1,
      Math.ceil((Date.parse(expiresAt) - nowMs) / 1_000),
    );
    throw new RateLimitError(retryAfter);
  }
}

export function repositoryErrorResponse(error: unknown) {
  if (
    error instanceof ReviewExpiredError ||
    error instanceof ReviewConflictError ||
    error instanceof ReviewForbiddenError ||
    error instanceof ReviewNotFoundError
  ) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (error instanceof RateLimitError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(error.retryAfter),
        },
      },
    );
  }

  return null;
}
