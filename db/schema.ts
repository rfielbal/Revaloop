import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  accent: text("accent").notNull().default("#ddebec"),
  createdAt: text("created_at").notNull(),
});

export const releases = sqliteTable(
  "releases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    title: text("title").notNull(),
    commitSha: text("commit_sha").notNull(),
    status: text("status", {
      enum: [
        "draft",
        "in_review",
        "changes_requested",
        "approved",
        "superseded",
      ],
    })
      .notNull()
      .default("draft"),
    shareToken: text("share_token").notNull().unique(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("releases_project_idx").on(table.projectId)],
);

export const feedbackItems = sqliteTable(
  "feedback_items",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: text("type", {
      enum: ["visual", "functional", "copy"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["open", "in_progress", "to_review", "resolved"],
    })
      .notNull()
      .default("open"),
    priority: text("priority", {
      enum: ["low", "normal", "high"],
    })
      .notNull()
      .default("normal"),
    pagePath: text("page_path").notNull().default("/"),
    viewport: text("viewport").notNull().default("desktop"),
    positionX: integer("position_x"),
    positionY: integer("position_y"),
    authorName: text("author_name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("feedback_release_idx").on(table.releaseId),
    index("feedback_status_idx").on(table.status),
  ],
);

export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["changes_requested", "approved"],
    }).notNull(),
    authorName: text("author_name").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("decisions_release_idx").on(table.releaseId)],
);

/*
 * Modèle applicatif sécurisé (alpha 0.2).
 *
 * Les quatre tables ci-dessus restent déclarées pendant la migration
 * expand/contract afin de ne pas détruire les données de démonstration 0.1.
 * Les parcours réels utilisent exclusivement les tables ci-dessous.
 */

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const organizationMembers = sqliteTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "developer"],
    })
      .notNull()
      .default("developer"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("organization_members_org_user_unique").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_members_user_idx").on(table.userId),
  ],
);

export const clientProjects = sqliteTable(
  "client_projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    accent: text("accent").notNull().default("#ddebec"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("client_projects_org_slug_unique").on(
      table.organizationId,
      table.slug,
    ),
    index("client_projects_org_idx").on(table.organizationId),
  ],
);

export const reviewReleases = sqliteTable(
  "review_releases",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => clientProjects.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    title: text("title").notNull(),
    commitSha: text("commit_sha").notNull().default(""),
    status: text("status", {
      enum: [
        "draft",
        "in_review",
        "changes_requested",
        "approved",
        "superseded",
      ],
    })
      .notNull()
      .default("in_review"),
    previewKind: text("preview_kind", {
      enum: ["external"],
    })
      .notNull()
      .default("external"),
    previewUrl: text("preview_url").notNull(),
    reviewerMessage: text("reviewer_message").notNull().default(""),
    feedbackSequence: integer("feedback_sequence").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUsers.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    closedAt: text("closed_at"),
  },
  (table) => [
    index("review_releases_project_idx").on(table.projectId),
    uniqueIndex("review_releases_project_version_unique").on(
      table.projectId,
      table.version,
    ),
  ],
);

export const reviewTestItems = sqliteTable(
  "review_test_items",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => reviewReleases.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_test_items_release_position_unique").on(
      table.releaseId,
      table.position,
    ),
    index("review_test_items_release_idx").on(table.releaseId),
  ],
);

export const reviewInvitations = sqliteTable(
  "review_invitations",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => reviewReleases.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    reviewerName: text("reviewer_name").notNull(),
    reviewerEmail: text("reviewer_email"),
    createdBy: text("created_by")
      .notNull()
      .references(() => appUsers.id, { onDelete: "restrict" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("review_invitations_release_idx").on(table.releaseId),
    index("review_invitations_token_idx").on(table.tokenHash),
  ],
);

export const reviewerSessions = sqliteTable(
  "reviewer_sessions",
  {
    id: text("id").primaryKey(),
    invitationId: text("invitation_id")
      .notNull()
      .references(() => reviewInvitations.id, { onDelete: "cascade" }),
    releaseId: text("release_id")
      .notNull()
      .references(() => reviewReleases.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    reviewerName: text("reviewer_name").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("reviewer_sessions_release_idx").on(table.releaseId),
    index("reviewer_sessions_invitation_idx").on(table.invitationId),
  ],
);

export const reviewFeedback = sqliteTable(
  "review_feedback",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => reviewReleases.id, { onDelete: "cascade" }),
    authorSessionId: text("author_session_id").references(
      () => reviewerSessions.id,
      { onDelete: "set null" },
    ),
    sequence: integer("sequence").notNull(),
    type: text("type", {
      enum: ["visual", "functional", "copy"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["open", "in_progress", "to_review", "resolved"],
    })
      .notNull()
      .default("open"),
    priority: text("priority", {
      enum: ["low", "normal", "high"],
    })
      .notNull()
      .default("normal"),
    pagePath: text("page_path").notNull().default("/"),
    pageTitle: text("page_title").notNull().default(""),
    viewport: text("viewport").notNull().default("desktop"),
    positionX: integer("position_x"),
    positionY: integer("position_y"),
    authorName: text("author_name").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_feedback_release_sequence_unique").on(
      table.releaseId,
      table.sequence,
    ),
    index("review_feedback_release_idx").on(table.releaseId),
    index("review_feedback_status_idx").on(table.status),
  ],
);

export const reviewDecisions = sqliteTable(
  "review_decisions",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => reviewReleases.id, { onDelete: "cascade" }),
    reviewerSessionId: text("reviewer_session_id").references(
      () => reviewerSessions.id,
      { onDelete: "set null" },
    ),
    status: text("status", {
      enum: ["changes_requested", "approved"],
    }).notNull(),
    authorName: text("author_name").notNull(),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_decisions_release_unique").on(table.releaseId),
    index("review_decisions_session_idx").on(table.reviewerSessionId),
  ],
);

export const reviewTestCompletions = sqliteTable(
  "review_test_completions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => reviewerSessions.id, { onDelete: "cascade" }),
    testItemId: text("test_item_id")
      .notNull()
      .references(() => reviewTestItems.id, { onDelete: "cascade" }),
    completedAt: text("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_test_completions_session_item_unique").on(
      table.sessionId,
      table.testItemId,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => clientProjects.id, {
      onDelete: "set null",
    }),
    releaseId: text("release_id").references(() => reviewReleases.id, {
      onDelete: "set null",
    }),
    actorType: text("actor_type", {
      enum: ["developer", "reviewer", "system"],
    }).notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("audit_events_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("audit_events_release_idx").on(table.releaseId),
  ],
);

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: text("expires_at").notNull(),
});
