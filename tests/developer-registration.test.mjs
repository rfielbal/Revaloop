import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const cloudflareWorkersModule = `data:text/javascript,${encodeURIComponent(`
import { DatabaseSync } from "node:sqlite";

export const testDatabase = new DatabaseSync(":memory:");
testDatabase.exec("PRAGMA foreign_keys = ON");

class TestD1Statement {
  constructor(sql) {
    this.sql = sql;
    this.parameters = [];
  }

  bind(...parameters) {
    this.parameters = parameters;
    return this;
  }

  run() {
    const statement = testDatabase.prepare(this.sql);
    if (this.sql.toUpperCase().includes("RETURNING")) {
      const results = statement.all(...this.parameters);
      const changes = testDatabase
        .prepare("SELECT changes() AS changes")
        .get().changes;
      return { meta: { changes: Number(changes) }, results };
    }
    const result = statement.run(...this.parameters);
    return { meta: { changes: Number(result.changes) }, results: [] };
  }

  all() {
    return {
      results: testDatabase.prepare(this.sql).all(...this.parameters),
    };
  }

  first() {
    return testDatabase.prepare(this.sql).get(...this.parameters) ?? null;
  }
}

class TestD1Database {
  prepare(sql) {
    return new TestD1Statement(sql);
  }

  batch(statements) {
    testDatabase.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.run());
      testDatabase.exec("COMMIT");
      return results;
    } catch (error) {
      testDatabase.exec("ROLLBACK");
      throw error;
    }
  }
}

export const env = { DB: new TestD1Database() };
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: cloudflareWorkersModule,
      };
    }

    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error?.code === "ERR_MODULE_NOT_FOUND" &&
        specifier.startsWith(".") &&
        !/\.[a-z0-9]+$/i.test(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const [{ testDatabase }, repository] = await Promise.all([
  import("cloudflare:workers"),
  import("../db/repository.ts"),
]);

await repository.ensureDatabase();

const activeTables = [
  "developer_sessions",
  "developer_credentials",
  "audit_events",
  "review_test_completions",
  "review_decisions",
  "review_feedback",
  "release_messages",
  "reviewer_sessions",
  "review_invitations",
  "review_test_items",
  "review_releases",
  "client_projects",
  "organization_members",
  "organizations",
  "app_users",
  "rate_limit_buckets",
];

function resetData() {
  testDatabase.exec("PRAGMA foreign_keys = OFF");
  for (const table of activeTables) {
    testDatabase.exec(`DELETE FROM ${table}`);
  }
  testDatabase.exec("PRAGMA foreign_keys = ON");
}

function seedLegacyPlaceholder(email = "raphael@revaloop.local") {
  testDatabase
    .prepare(
      `INSERT INTO app_users
        (id, email, display_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "user_legacy",
      email,
      "Studio historique",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  testDatabase
    .prepare(
      `INSERT INTO organizations (id, name, slug, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      "org_legacy",
      "Organisation historique",
      "organisation-historique",
      "2026-01-01T00:00:00.000Z",
    );
  testDatabase
    .prepare(
      `INSERT INTO organization_members
        (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'owner', ?)`,
    )
    .run(
      "member_legacy",
      "org_legacy",
      "user_legacy",
      "2026-01-01T00:00:00.000Z",
    );
  testDatabase
    .prepare(
      `INSERT INTO client_projects
        (id, organization_id, slug, name, description, accent, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', '#ddebec', ?, ?)`,
    )
    .run(
      "project_legacy",
      "org_legacy",
      "projet-historique",
      "Projet historique",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
}

function credentialInput(overrides = {}) {
  return {
    email: "owner@example.test",
    displayName: "Studio repris",
    passwordHash: "hash-test",
    passwordSalt: "salt-test",
    passwordIterations: 100_000,
    ...overrides,
  };
}

function registrationState() {
  const rows = (sql) =>
    testDatabase
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }));

  return {
    users: rows("SELECT * FROM app_users ORDER BY id"),
    organizations: rows("SELECT * FROM organizations ORDER BY id"),
    memberships: rows("SELECT * FROM organization_members ORDER BY id"),
    projects: rows("SELECT * FROM client_projects ORDER BY id"),
    credentials: rows("SELECT * FROM developer_credentials ORDER BY user_id"),
  };
}

test("reprend l’unique placeholder avec l’identité Sites correspondante", async () => {
  resetData();
  seedLegacyPlaceholder();

  assert.equal(
    await repository.getRecoverableLocalDeveloperPlaceholderEmail(),
    "raphael@revaloop.local",
  );

  const identity = await repository.registerDeveloperCredential(
    credentialInput({
      sitesAuthenticatedEmail: "owner@example.test",
    }),
  );

  assert.deepEqual(identity, {
    displayName: "Studio repris",
    email: "owner@example.test",
  });
  assert.deepEqual(
    {
      ...testDatabase
      .prepare(
        `SELECT app_users.id, app_users.email, organization_members.organization_id
         FROM app_users
         INNER JOIN organization_members
           ON organization_members.user_id = app_users.id`,
      )
      .get(),
    },
    {
      id: "user_legacy",
      email: "owner@example.test",
      organization_id: "org_legacy",
    },
  );
  assert.equal(
    testDatabase
      .prepare(
        "SELECT organization_id FROM client_projects WHERE id = 'project_legacy'",
      )
      .get().organization_id,
    "org_legacy",
  );
  assert.equal(
    testDatabase
      .prepare("SELECT user_id FROM developer_credentials")
      .get().user_id,
    "user_legacy",
  );
});

test("refuse toute reprise legacy sans identité Sites correspondante", async () => {
  for (const input of [
    credentialInput(),
    credentialInput({
      sitesAuthenticatedEmail: "different@example.test",
    }),
    credentialInput({
      email: "raphael@revaloop.local",
    }),
  ]) {
    resetData();
    seedLegacyPlaceholder();

    await assert.rejects(
      repository.registerDeveloperCredential(input),
      repository.ReviewConflictError,
    );
    assert.deepEqual(
      {
        ...testDatabase
        .prepare("SELECT id, email FROM app_users")
        .get(),
      },
      {
        id: "user_legacy",
        email: "raphael@revaloop.local",
      },
    );
    assert.equal(
      testDatabase
        .prepare("SELECT COUNT(*) AS count FROM developer_credentials")
        .get().count,
      0,
    );
  }
});

test("autorise le placeholder exact uniquement pour la reprise locale explicite", async () => {
  resetData();
  seedLegacyPlaceholder();

  const identity = await repository.registerDeveloperCredential(
    credentialInput({
      email: "raphael@revaloop.local",
      allowLocalPlaceholderRecovery: true,
    }),
  );

  assert.equal(identity.email, "raphael@revaloop.local");
  assert.equal(
    testDatabase
      .prepare("SELECT user_id FROM developer_credentials")
      .get().user_id,
    "user_legacy",
  );
});

test("conserve le bootstrap normal lorsqu’aucun espace legacy n’existe", async () => {
  resetData();

  const identity = await repository.registerDeveloperCredential(
    credentialInput(),
  );

  assert.equal(identity.email, "owner@example.test");
  assert.equal(
    testDatabase
      .prepare("SELECT COUNT(*) AS count FROM organizations")
      .get().count,
    1,
  );
  assert.equal(
    testDatabase
      .prepare("SELECT COUNT(*) AS count FROM developer_credentials")
      .get().count,
    1,
  );
});

test("le mode multi-inscription refuse un utilisateur legacy existant sans preuve et sans mutation", async () => {
  resetData();
  seedLegacyPlaceholder();
  const before = registrationState();

  await assert.rejects(
    repository.registerDeveloperCredential(
      credentialInput({
        email: "raphael@revaloop.local",
        displayName: "Tentative de reprise",
        allowAdditional: true,
      }),
    ),
    repository.ReviewConflictError,
  );

  assert.deepEqual(registrationState(), before);
});

test("le mode multi-inscription refuse une collision avec un credential sans altérer le compte", async () => {
  resetData();
  await repository.registerDeveloperCredential(credentialInput());
  const before = registrationState();

  await assert.rejects(
    repository.registerDeveloperCredential(
      credentialInput({
        displayName: "Nom injecté",
        passwordHash: "hash-remplacement",
        allowAdditional: true,
        sitesAuthenticatedEmail: "owner@example.test",
      }),
    ),
    repository.ReviewConflictError,
  );

  assert.deepEqual(registrationState(), before);
});

test("le mode multi-inscription crée seulement un nouvel utilisateur pour un nouvel e-mail", async () => {
  resetData();
  await repository.registerDeveloperCredential(credentialInput());

  const identity = await repository.registerDeveloperCredential(
    credentialInput({
      email: "second@example.test",
      displayName: "Second studio",
      passwordHash: "hash-second",
      passwordSalt: "salt-second",
      allowAdditional: true,
    }),
  );

  assert.deepEqual(identity, {
    displayName: "Second studio",
    email: "second@example.test",
  });
  assert.equal(
    testDatabase
      .prepare("SELECT COUNT(*) AS count FROM app_users")
      .get().count,
    2,
  );
  assert.equal(
    testDatabase
      .prepare("SELECT COUNT(*) AS count FROM developer_credentials")
      .get().count,
    2,
  );
});

test("une preuve de reprise reste nécessaire même lorsque les inscriptions sont ouvertes", async () => {
  resetData();
  seedLegacyPlaceholder("owner@example.test");

  const identity = await repository.registerDeveloperCredential(
    credentialInput({
      allowAdditional: true,
      sitesAuthenticatedEmail: "owner@example.test",
    }),
  );

  assert.deepEqual(identity, {
    displayName: "Studio repris",
    email: "owner@example.test",
  });
  assert.equal(
    testDatabase
      .prepare("SELECT user_id FROM developer_credentials")
      .get().user_id,
    "user_legacy",
  );
});

test("conserve la session cliente lorsque le tunnel change d’adresse", async () => {
  resetData();
  const identity = await repository.registerDeveloperCredential(
    credentialInput(),
  );
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const created = await repository.createProjectWithRelease(identity, {
    name: "Pilote cliente",
    description: "Parcours réel de validation",
    accent: "#ddebec",
    release: {
      version: "v0.1",
      title: "Première recette",
      commitSha: "",
      previewUrl: "https://first.trycloudflare.com/",
      reviewerMessage: "Testez librement le parcours.",
      testItems: [],
      expiresAt,
    },
  });

  let workspace = await repository.getDeveloperWorkspace(
    identity,
    created.projectId,
    created.releaseId,
  );
  assert.equal(workspace.activeReview.clientAccess.status, "none");

  const invitation = await repository.createInvitation(identity, {
    releaseId: created.releaseId,
    reviewerName: "Cliente pilote",
    reviewerEmail: "cliente@example.test",
    expiresAt,
  });
  workspace = await repository.getDeveloperWorkspace(
    identity,
    created.projectId,
    created.releaseId,
  );
  assert.deepEqual(
    {
      status: workspace.activeReview.clientAccess.status,
      reviewerName: workspace.activeReview.clientAccess.reviewerName,
      reviewerEmail: workspace.activeReview.clientAccess.reviewerEmail,
    },
    {
      status: "invited",
      reviewerName: "Cliente pilote",
      reviewerEmail: "cliente@example.test",
    },
  );

  const session = await repository.exchangeInvitation(invitation.secret);
  assert.ok(session);
  workspace = await repository.getDeveloperWorkspace(
    identity,
    created.projectId,
    created.releaseId,
  );
  assert.equal(workspace.activeReview.clientAccess.status, "opened");

  const updated = await repository.incrementPreviewRevision(
    identity,
    created.releaseId,
    "https://second.trycloudflare.com/",
  );
  assert.equal(updated.previewUrl, "https://second.trycloudflare.com/");
  assert.equal(updated.previewRevision, 1);

  const reviewerView = await repository.getReviewForReviewer(
    session.releaseId,
    session.sessionToken,
  );
  assert.equal(
    reviewerView.release.previewUrl,
    "https://second.trycloudflare.com/",
  );
  assert.equal(reviewerView.release.previewRevision, 1);
});

test("n’attribue pas à la cliente une session automatiquement expirée", async () => {
  resetData();
  const identity = await repository.registerDeveloperCredential(
    credentialInput(),
  );
  const invitationExpiresAt = new Date(
    Date.now() + 7 * 86_400_000,
  ).toISOString();
  const created = await repository.createProjectWithRelease(identity, {
    name: "Pilote cliente",
    description: "Parcours réel de validation",
    accent: "#ddebec",
    release: {
      version: "v0.1",
      title: "Première recette",
      commitSha: "",
      previewUrl: "https://first.trycloudflare.com/",
      reviewerMessage: "Testez librement le parcours.",
      testItems: [],
      expiresAt: invitationExpiresAt,
    },
  });
  const invitation = await repository.createInvitation(identity, {
    releaseId: created.releaseId,
    reviewerName: "Cliente pilote",
    reviewerEmail: "cliente@example.test",
    expiresAt: invitationExpiresAt,
  });

  await repository.exchangeInvitation(invitation.secret);
  testDatabase
    .prepare(
      `UPDATE reviewer_sessions
       SET expires_at = ?
       WHERE release_id = ?`,
    )
    .run(
      new Date(Date.now() - 60_000).toISOString(),
      created.releaseId,
    );

  const workspace = await repository.getDeveloperWorkspace(
    identity,
    created.projectId,
    created.releaseId,
  );

  assert.equal(workspace.activeReview.clientAccess.status, "inactive");
});
