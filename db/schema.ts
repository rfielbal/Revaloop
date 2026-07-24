import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
      enum: ["draft", "in_review", "changes_requested", "approved"],
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
