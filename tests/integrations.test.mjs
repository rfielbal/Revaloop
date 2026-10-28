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
    "0006_steep_snowbird",
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

const newRelease = (version = "v2") => ({
  version,
  title: "Version de recette",
  commitSha: "abc123",
  previewUrl: "https://preview.example.test/",
  reviewerMessage: "Vérifier le formulaire",
  expiresInDays: 14,
  testItems: [
    { title: "Envoyer un message", description: "Vérifier la confirmation." },
  ],
});
async function orgConnected(f, write = true) {
  const token = await f.service.createOrganizationToken(f.member, {
    label: "VisionBuild",
    write,
    expiresInDays: 30,
  });
  return { token, context: await f.service.authenticate(token.token) };
}
test("organization token is hashed and bounded to its organization, existing project tokens stay bounded", async () => {
  const f = fixture();
  try {
    const { context, token } = await orgConnected(f);
    assert.equal(context.scope, "organization");
    assert.equal(context.projectId, null);
    const caps = await f.service.capabilities(context);
    assert.equal(caps.project, null);
    assert.ok(caps.capabilities.includes("projects:write"));
    assert.equal((await f.service.catalog(context)).projects.length, 1);
    await assert.rejects(f.service.snapshot(context, "p2"), { status: 401 });
    assert.equal((await f.service.snapshot(context, "p1")).project.id, "p1");
    assert.equal(
      JSON.stringify(await f.service.listOrganizationTokens(f.member)).includes(
        token.token,
      ),
      false,
    );
    const old = await connected(f);
    assert.deepEqual(
      (await f.service.catalog(old.context)).projects.map((p) => p.id),
      ["p1"],
    );
    assert.ok(!old.context.capabilities.includes("releases:write"));
    await f.service.revokeOrganizationToken(f.member, token.id);
    await assert.rejects(f.service.authenticate(token.token), { status: 401 });
  } finally {
    f.db.close();
  }
});
test("project creation with first release is atomic, idempotent and catalog-version guarded", async () => {
  const f = fixture();
  try {
    const { context } = await orgConnected(f);
    const before = await f.service.catalog(context);
    const command = request(before.version, {
      type: "project.create",
      name: "Client project",
      description: "Client provided brief",
      release: newRelease("v1"),
    });
    const created = await f.service.createProject(context, command);
    assert.equal(created.snapshot.project.name, "Client project");
    assert.equal(
      created.snapshot.releases[0].testItems[0].title,
      "Envoyer un message",
    );
    assert.equal(
      created.snapshot.releases[0].reviewerMessage,
      "Vérifier le formulaire",
    );
    const replay = await f.service.createProject(context, command);
    assert.equal(replay.alreadyApplied, true);
    assert.equal(replay.result.projectId, created.result.projectId);
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM client_projects WHERE organization_id=?",
        )
        .get("o1").n,
      2,
    );
    await assert.rejects(
      f.service.createProject(context, {
        ...command,
        requestId: crypto.randomUUID(),
      }),
      { status: 409 },
    );
    await assert.rejects(
      f.service.createProject(context, {
        ...command,
        command: { ...command.command, name: "Changed" },
      }),
      { code: "idempotency_conflict" },
    );
  } finally {
    f.db.close();
  }
});
test("organization creation races do not duplicate projects or releases", async () => {
  const f = fixture();
  try {
    const { context } = await orgConnected(f);
    const catalog = await f.service.catalog(context);
    const command = request(catalog.version, {
      type: "project.create",
      name: "Race project",
      description: "",
      release: newRelease("v1"),
    });
    const results = await Promise.all([
      f.service.createProject(context, command),
      f.service.createProject(context, command),
    ]);
    assert.equal(results[0].result.projectId, results[1].result.projectId);
    assert.equal(results.filter((r) => !r.alreadyApplied).length, 1);
  } finally {
    f.db.close();
  }
});
test("invitation secret exists in first response only; retries never rotate and explicit replacement revokes previous", async () => {
  const f = fixture();
  try {
    const { context } = await orgConnected(f);
    const snap = await f.service.snapshot(context, "p1");
    const body = {
      type: "invitation.create",
      releaseId: "r1",
      reviewerName: "Client fictif",
      reviewerEmail: "client@example.test",
      expiresInDays: 7,
      replaceExisting: false,
    };
    const command = request(snap.version, body);
    const made = await f.service.command(context, "p1", command);
    assert.match(made.result.invitePath, /^\/join#token=[A-Za-z0-9_-]{43}$/);
    assert.equal(made.snapshot.invitations.length, 1);
    assert.equal(
      JSON.stringify(made.snapshot).includes("client@example.test"),
      false,
    );
    assert.equal(
      JSON.stringify(
        f.db.prepare("SELECT * FROM integration_command_receipts").all(),
      ).includes(made.result.invitePath.split("=")[1]),
      false,
    );
    const replay = await f.service.command(context, "p1", command);
    assert.equal(replay.alreadyApplied, true);
    assert.equal(replay.result.invitePath, undefined);
    assert.equal(replay.result.secretUnavailable, true);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM review_invitations").get().n,
      1,
    );
    await assert.rejects(
      f.service.command(context, "p1", request(made.snapshot.version, body)),
      { code: "invitation_exists" },
    );
    const rotated = await f.service.command(
      context,
      "p1",
      request(made.snapshot.version, { ...body, replaceExisting: true }),
    );
    assert.notEqual(rotated.result.invitePath, made.result.invitePath);
    assert.equal(
      rotated.snapshot.invitations.filter((i) => !i.revokedAt).length,
      1,
    );
    const revoked = await f.service.command(
      context,
      "p1",
      request(rotated.snapshot.version, {
        type: "invitation.revoke",
        releaseId: "r1",
      }),
    );
    assert.equal(
      revoked.snapshot.invitations.filter((i) => !i.revokedAt).length,
      0,
    );
  } finally {
    f.db.close();
  }
});
test("preview updates version and revision while immutable commit and client authority remain unchanged", async () => {
  const f = fixture();
  try {
    const { context } = await orgConnected(f);
    const before = await f.service.snapshot(context, "p1");
    const command = request(before.version, {
      type: "preview.update",
      releaseId: "r1",
      previewUrl: "https://changed.example.test/",
    });
    const update = await f.service.command(context, "p1", command);
    assert.equal(update.snapshot.releases[0].previewRevision, 1);
    assert.equal(
      update.snapshot.releases[0].previewUrl,
      "https://changed.example.test/",
    );
    assert.equal(update.snapshot.releases[0].commitSha, "abcdef");
    assert.notEqual(update.snapshot.version, before.version);
    assert.equal(
      (await f.service.command(context, "p1", command)).snapshot.releases[0]
        .previewRevision,
      1,
    );
    assert.throws(
      () =>
        parseIntegrationCommand(
          request(update.snapshot.version, {
            type: "feedback.transition",
            feedbackId: "f1",
            status: "resolved",
          }),
        ),
      { status: 400 },
    );
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(update.snapshot.version, {
          type: "preview.update",
          releaseId: "r2",
        }),
      ),
      { status: 404 },
    );
  } finally {
    f.db.close();
  }
});
test("new release requires previous closure, unique version and fresh snapshot", async () => {
  const f = fixture();
  try {
    const { context } = await orgConnected(f);
    let s = await f.service.snapshot(context, "p1");
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(s.version, { type: "release.create", release: newRelease() }),
      ),
      { code: "active_release" },
    );
    f.db
      .prepare("UPDATE review_releases SET status='approved' WHERE id='r1'")
      .run();
    s = await f.service.snapshot(context, "p1");
    const command = request(s.version, {
      type: "release.create",
      release: newRelease(),
    });
    const created = await f.service.command(context, "p1", command);
    assert.equal(created.snapshot.releases.length, 2);
    assert.equal(
      created.snapshot.releases.find((r) => r.version === "v2").testItems
        .length,
      1,
    );
    assert.equal(
      (await f.service.command(context, "p1", command)).alreadyApplied,
      true,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM review_releases WHERE project_id='p1'",
        )
        .get().n,
      2,
    );
  } finally {
    f.db.close();
  }
});
test("read-only credentials cannot create lifecycle objects and revocation invalidates cached organization context", async () => {
  const f = fixture();
  try {
    const { context, token } = await orgConnected(f, false);
    const catalog = await f.service.catalog(context),
      s = await f.service.snapshot(context, "p1");
    await assert.rejects(
      f.service.createProject(
        context,
        request(catalog.version, {
          type: "project.create",
          name: "Denied",
          description: "",
          release: newRelease(),
        }),
      ),
      { status: 403 },
    );
    await assert.rejects(
      f.service.command(
        context,
        "p1",
        request(s.version, { type: "preview.update", releaseId: "r1" }),
      ),
      { status: 403 },
    );
    await f.service.revokeOrganizationToken(f.member, token.id);
    await assert.rejects(f.service.catalog(context), { status: 401 });
    await assert.rejects(f.service.snapshot(context, "p1"), { status: 401 });
  } finally {
    f.db.close();
  }
});
test("invitations and test instructions invalidate both project and catalog revisions without session heartbeat churn", async () => {
  const f = fixture();
  try {
    const { context } = await orgConnected(f);
    const before = await f.service.snapshot(context, "p1"),
      catalog = await f.service.catalog(context);
    f.db
      .prepare(
        "INSERT INTO review_test_items VALUES('ti','r1',0,'A test','Description','2026-10-28T10:00:00.000Z')",
      )
      .run();
    assert.notEqual(
      (await f.service.snapshot(context, "p1")).version,
      before.version,
    );
    assert.notEqual(
      (await f.service.catalog(context)).version,
      catalog.version,
    );
    const statements = f.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'integration_reviewer_sessions%'",
      )
      .all();
    assert.equal(statements.length, 0);
  } finally {
    f.db.close();
  }
});

test("an existing organization initializes its revision through a bounded authenticated catalog read", async () => {
  const f = fixture();
  try {
    const { context, token } = await orgConnected(f);
    f.db
      .prepare(
        "DELETE FROM integration_organization_revisions WHERE organization_id='o1'",
      )
      .run();
    const catalog = await f.service.catalog(context);
    assert.match(catalog.version, /^[a-f0-9]{64}$/);
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM integration_organization_revisions WHERE organization_id='o1'",
        )
        .get().n,
      1,
    );
    const again = await f.service.catalog(context);
    assert.equal(again.version, catalog.version);
    await f.service.revokeOrganizationToken(f.member, token.id);
    f.db
      .prepare(
        "DELETE FROM integration_organization_revisions WHERE organization_id='o1'",
      )
      .run();
    await assert.rejects(f.service.catalog(context), { status: 401 });
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM integration_organization_revisions WHERE organization_id='o1'",
        )
        .get().n,
      0,
    );
  } finally {
    f.db.close();
  }
});
