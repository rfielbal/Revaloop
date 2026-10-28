import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (
        error?.code === "ERR_MODULE_NOT_FOUND" &&
        specifier.startsWith(".") &&
        !/\.[a-z0-9]+$/i.test(specifier)
      )
        return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});
const { createIntegrationService } = await import("../db/integrations.ts");
const { parseIntegrationCommand } =
  await import("../lib/integration-contract.ts");
const migrations = await Promise.all(
  [
    "0000_redundant_vance_astro",
    "0001_sleepy_paper_doll",
    "0002_sticky_mystique",
    "0003_sparkling_wrecker",
    "0004_new_ben_parker",
    "0005_typical_stephen_strange",
  ].map((file) =>
    readFile(new URL(`../drizzle/${file}.sql`, import.meta.url), "utf8"),
  ),
);
function adapter(db) {
  class Statement {
    constructor(sql) {
      this.sql = sql;
      this.parameters = [];
    }
    bind(...parameters) {
      this.parameters = parameters;
      return this;
    }
    first() {
      return db.prepare(this.sql).get(...this.parameters) ?? null;
    }
    all() {
      return this.execute();
    }
    run() {
      return this.execute();
    }
    execute() {
      const before = db.prepare("SELECT total_changes() AS n").get().n;
      const statement = db.prepare(this.sql);
      const results = statement.columns().length
        ? statement.all(...this.parameters)
        : [];
      if (!statement.columns().length) statement.run(...this.parameters);
      const changed =
        db.prepare("SELECT total_changes() AS n").get().n - before;
      return { results, success: true, meta: { changes: Number(changed) } };
    }
  }
  return {
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => s.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations)
    for (const statement of migration.split("--> statement-breakpoint"))
      if (statement.trim()) db.exec(statement);
  const at = "2026-10-28T10:00:00.000Z";
  for (const n of [1, 2]) {
    db.prepare("INSERT INTO app_users VALUES(?,?,?,?,?)").run(
      `u${n}`,
      `u${n}@example.test`,
      `Developer ${n}`,
      at,
      at,
    );
    db.prepare("INSERT INTO organizations VALUES(?,?,?,?)").run(
      `o${n}`,
      `Org ${n}`,
      `org-${n}`,
      at,
    );
    db.prepare("INSERT INTO organization_members VALUES(?,?,?,?,?)").run(
      `m${n}`,
      `o${n}`,
      `u${n}`,
      "owner",
      at,
    );
    db.prepare("INSERT INTO client_projects VALUES(?,?,?,?,?,?,?,?)").run(
      `p${n}`,
      `o${n}`,
      `p-${n}`,
      `Project ${n}`,
      "Description",
      "#fff",
      at,
      at,
    );
    db.prepare(
      `INSERT INTO review_releases(id,project_id,version,title,commit_sha,status,preview_kind,preview_url,reviewer_message,feedback_sequence,created_by,created_at,updated_at,expires_at,closed_at,preview_revision)
    VALUES(?,?,?,?,?,'in_review','external',?,'',0,?,?,?,?,NULL,0)`,
    ).run(
      `r${n}`,
      `p${n}`,
      "v1",
      "Release",
      "abcdef",
      `https://preview-${n}.example.test`,
      `u${n}`,
      at,
      at,
      "2026-12-01T10:00:00.000Z",
    );
    db.prepare(
      `INSERT INTO review_feedback(id,release_id,author_session_id,sequence,type,title,body,status,priority,page_path,page_title,viewport,position_x,position_y,author_name,created_at,updated_at,author_type)
    VALUES(?,?,NULL,1,'functional','Button','Please fix','open','normal','/','Home','desktop',NULL,NULL,'Client',?,?,'reviewer')`,
    ).run(`f${n}`, `r${n}`, at, at);
  }
  let current = at;
  const service = createIntegrationService(adapter(db), () => current);
  const member = { userId: "u1", organizationId: "o1", role: "owner" };
  const issue = async (write = true) =>
    service.createToken(member, {
      projectId: "p1",
      label: "VisionBuild",
      write,
      expiresInDays: 30,
    });
  return {
    db,
    service,
    member,
    issue,
    setTime: (value) => {
      current = value;
    },
  };
}
const request = (version, command, requestId = crypto.randomUUID()) => ({
  requestId,
  expectedVersion: version,
  command,
});
async function connected(f, write = true) {
  const token = await f.issue(write);
  return { token, context: await f.service.authenticate(token.token) };
}

test("integration tokens are hashed, unique, project-scoped and explicitly revocable", async () => {
  const f = fixture();
  try {
    const { token, context } = await connected(f, false);
    const rows = await f.service.listTokens(f.member, "p1");
    assert.equal(rows.length, 1);
    assert.equal(JSON.stringify(rows).includes(token.token), false);
    const stored = f.db
      .prepare("SELECT token_hash FROM integration_tokens")
      .get();
    assert.notEqual(stored.token_hash, token.token);
    assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
    const capability = await f.service.capabilities(context);
    assert.deepEqual(capability.capabilities, [
      "projects:read",
      "reviews:read",
    ]);
    assert.equal(capability.project.id, "p1");
    assert.equal(capability.organizationId, "o1");
    await assert.rejects(
      f.service.snapshot(context, "p2"),
      (e) => e.status === 404,
    );
    await assert.rejects(
      f.service.createToken(f.member, {
        projectId: "p2",
        label: "bad",
        write: true,
        expiresInDays: 30,
      }),
      (e) => e.status === 404,
    );
    await f.service.revokeToken(f.member, "p1", token.id);
    await assert.rejects(
      f.service.authenticate(token.token),
      (e) => e.status === 401,
    );
    await assert.rejects(
      f.service.snapshot(context, "p1"),
      (e) => e.status === 401,
    );
  } finally {
    f.db.close();
  }
});
test("tokens expire and lose authority when membership is removed", async () => {
  const f = fixture();
  try {
    const { token } = await connected(f);
    f.setTime("2027-01-01T00:00:00.000Z");
    await assert.rejects(
      f.service.authenticate(token.token),
      (e) => e.status === 401,
    );
    f.setTime("2026-10-28T10:00:00.000Z");
    f.db.exec("DELETE FROM organization_members WHERE id='m1'");
    await assert.rejects(
      f.service.authenticate(token.token),
      (e) => e.status === 401,
    );
  } finally {
    f.db.close();
  }
});
test("snapshot only exposes public review fields and changes version on web writes", async () => {
  const f = fixture();
  try {
    const { context } = await connected(f);
    const first = await f.service.snapshot(context, "p1");
    assert.equal(first.apiVersion, "1");
    assert.equal(first.feedback[0].route, "/");
    assert.equal(first.releases[0].id, "r1");
    assert.equal(first.limited, false);
    assert.equal("reviewerEmail" in first, false);
    assert.equal(JSON.stringify(first).includes("token_hash"), false);
    assert.equal(
      (await f.service.snapshot(context, "p1")).version,
      first.version,
    );
    f.db.exec(
      "UPDATE review_feedback SET body='Updated by client' WHERE id='f1'",
    );
    assert.notEqual(
      (await f.service.snapshot(context, "p1")).version,
      first.version,
    );
  } finally {
    f.db.close();
  }
});
test("commands retain developer status semantics and reject client approval", async () => {
  const f = fixture();
  try {
    const { context } = await connected(f);
    let snapshot = await f.service.snapshot(context, "p1");
    const one = await f.service.command(
      context,
      "p1",
      request(snapshot.version, {
        type: "feedback.transition",
        feedbackId: "f1",
        status: "in_progress",
      }),
    );
    assert.equal(one.snapshot.feedback[0].status, "in_progress");
    const two = await f.service.command(
      context,
      "p1",
      request(one.snapshot.version, {
        type: "feedback.transition",
        feedbackId: "f1",
        status: "to_review",
      }),
    );
    assert.equal(two.snapshot.feedback[0].status, "to_review");
    assert.throws(
      () =>
        parseIntegrationCommand(
          request(two.snapshot.version, {
            type: "feedback.transition",
            feedbackId: "f1",
            status: "resolved",
          }),
        ),
      (e) => e.status === 400,
    );
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(two.snapshot.version, {
          type: "feedback.transition",
          feedbackId: "f1",
          status: "in_progress",
        }),
      ),
      (e) => e.code === "invalid_transition",
    );
  } finally {
    f.db.close();
  }
});
test("shared messages and transitions are idempotent and reject stale targets", async () => {
  const f = fixture();
  try {
    const { context } = await connected(f);
    const snapshot = await f.service.snapshot(context, "p1");
    const payload = request(snapshot.version, {
      type: "message.create",
      releaseId: "r1",
      body: "The correction is ready to test.",
    });
    const first = await f.service.command(context, "p1", payload);
    assert.equal(first.alreadyApplied, false);
    const again = await f.service.command(context, "p1", payload);
    assert.equal(again.alreadyApplied, true);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM release_messages").get().n,
      1,
    );
    await assert.rejects(
      f.service.command(context, "p1", {
        ...payload,
        command: { ...payload.command, body: "Other" },
      }),
      (e) => e.code === "idempotency_conflict",
    );
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(snapshot.version, {
          type: "feedback.transition",
          feedbackId: "f1",
          status: "in_progress",
        }),
      ),
      (e) => e.code === "stale_snapshot",
    );
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(first.snapshot.version, {
          type: "message.create",
          releaseId: "r2",
          body: "wrong project",
        }),
      ),
      (e) => e.status === 404,
    );
  } finally {
    f.db.close();
  }
});
test("read tokens never mutate and completed releases refuse messages", async () => {
  const f = fixture();
  try {
    const read = await connected(f, false);
    let snapshot = await f.service.snapshot(read.context, "p1");
    await assert.rejects(
      f.service.command(
        read.context,
        "p1",
        request(snapshot.version, {
          type: "message.create",
          releaseId: "r1",
          body: "no",
        }),
      ),
      (e) => e.status === 403,
    );
    const write = await connected(f, true);
    f.db.exec("UPDATE review_releases SET status='approved' WHERE id='r1'");
    snapshot = await f.service.snapshot(write.context, "p1");
    await assert.rejects(
      f.service.command(
        write.context,
        "p1",
        request(snapshot.version, {
          type: "message.create",
          releaseId: "r1",
          body: "no",
        }),
      ),
      (e) => e.status === 409,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM release_messages").get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});
test("concurrent commands with the same snapshot cannot both apply", async () => {
  const f = fixture();
  try {
    const { context } = await connected(f);
    const snapshot = await f.service.snapshot(context, "p1");
    const results = await Promise.allSettled(
      ["A", "B"].map((body) =>
        f.service.command(
          context,
          "p1",
          request(snapshot.version, {
            type: "message.create",
            releaseId: "r1",
            body,
          }),
        ),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM release_messages").get().n,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("bounded snapshots never return children without their release", async () => {
  const f = fixture();
  try {
    const { context } = await connected(f);
    for (let i = 0; i < 101; i++)
      f.db
        .prepare(
          `INSERT INTO review_releases(id,project_id,version,title,commit_sha,status,preview_kind,preview_url,reviewer_message,feedback_sequence,created_by,created_at,updated_at,expires_at,closed_at,preview_revision)
 SELECT ?,project_id,?,title,commit_sha,'approved',preview_kind,preview_url,reviewer_message,0,created_by,'2026-11-01T10:00:00.000Z',updated_at,expires_at,closed_at,0 FROM review_releases WHERE id='r1'`,
        )
        .run(`new_${String(i).padStart(3, "0")}`, `v${i + 2}`);
    const snapshot = await f.service.snapshot(context, "p1");
    assert.equal(snapshot.releases.length, 100);
    assert.equal(snapshot.limited, true);
    const ids = new Set(snapshot.releases.map((r) => r.id));
    assert.equal(
      snapshot.feedback.every((f) => ids.has(f.releaseId)),
      true,
    );
    assert.equal(snapshot.feedback.length, 0);
  } finally {
    f.db.close();
  }
});
test("a revoked token cannot apply a command even with a cached context", async () => {
  const f = fixture();
  try {
    const { context, token } = await connected(f);
    const snapshot = await f.service.snapshot(context, "p1");
    await f.service.revokeToken(f.member, "p1", token.id);
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(snapshot.version, {
          type: "message.create",
          releaseId: "r1",
          body: "Must not send",
        }),
      ),
      (e) => e.status === 401,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM release_messages").get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});
