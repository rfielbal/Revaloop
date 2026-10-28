import {
  IntegrationError,
  integrationDigest,
  integrationReadCapabilities,
  integrationWriteCapabilities,
  integrationLifecycleCapabilities,
} from "../lib/integration-contract";
import {
  parseProjectCreation,
  parseWorkflowCommand,
  type WorkflowCommand,
  type WorkflowRelease,
} from "../lib/integration-workflow-contract";
import type {
  IntegrationMember,
  IntegrationSnapshot,
  IntegrationTokenContext,
} from "./integrations";
type Envelope<C> = { requestId: string; expectedVersion: string; command: C };
type Helpers = {
  now: () => string;
  instanceId: () => Promise<string>;
  readSnapshot: (
    c: IntegrationTokenContext,
    id: string,
  ) => Promise<{ snapshot: IntegrationSnapshot; revision: number }>;
};
const stale = () =>
  new IntegrationError(
    409,
    "stale_snapshot",
    "La recette a changé. Actualisez-la avant de réessayer.",
  );
const denied = () =>
  new IntegrationError(
    403,
    "scope_denied",
    "Cette connexion ne permet pas cette action.",
  );
const invalid = () =>
  new IntegrationError(
    401,
    "invalid_token",
    "Cette connexion est expirée, révoquée ou invalide.",
  );
function envelope<C>(i: Envelope<C>) {
  if (
    !i ||
    Object.keys(i).some(
      (k) => !["requestId", "expectedVersion", "command"].includes(k),
    ) ||
    !/^([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(
      i.requestId,
    ) ||
    !/^[a-f0-9]{64}$/.test(i.expectedVersion)
  )
    throw new IntegrationError(
      400,
      "invalid_command",
      "La commande ou sa version est invalide.",
    );
}
function secret(prefix = "") {
  return (
    prefix +
    btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "")
  );
}
const receiptGuard =
  "EXISTS(SELECT 1 FROM integration_command_receipts WHERE project_id=? AND request_id=? AND execution_id=?)";
export function createIntegrationWorkflow(db: D1Database, h: Helpers) {
  async function orgMember(member: IntegrationMember) {
    const m = await db
      .prepare(
        "SELECT role FROM organization_members WHERE user_id=? AND organization_id=?",
      )
      .bind(member.userId, member.organizationId)
      .first<{ role: string }>();
    if (!m || !["owner", "developer"].includes(m.role)) throw denied();
    return m.role;
  }
  async function createOrganizationToken(
    member: IntegrationMember,
    input: { label: string; write: boolean; expiresInDays: number },
  ) {
    await orgMember(member);
    const count = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM integration_organization_tokens WHERE organization_id=? AND revoked_at IS NULL AND expires_at>?",
      )
      .bind(member.organizationId, h.now())
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 20)
      throw new IntegrationError(
        409,
        "token_limit",
        "Révoquez une connexion avant d’en créer une nouvelle.",
      );
    const token = secret("rvo_"),
      id = `integration_${crypto.randomUUID()}`,
      createdAt = h.now(),
      expiresAt = new Date(
        Date.parse(createdAt) + input.expiresInDays * 86400000,
      ).toISOString(),
      capabilities = [
        ...integrationReadCapabilities,
        ...(input.write
          ? [
              ...integrationWriteCapabilities,
              ...integrationLifecycleCapabilities,
            ]
          : []),
      ];
    await db
      .prepare(
        "INSERT INTO integration_organization_tokens(id,token_hash,user_id,organization_id,label,capabilities_json,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        await integrationDigest(token),
        member.userId,
        member.organizationId,
        input.label,
        JSON.stringify(capabilities),
        createdAt,
        expiresAt,
      )
      .run();
    return {
      id,
      token,
      scope: "organization",
      projectId: null,
      capabilities,
      expiresAt,
    };
  }
  async function listOrganizationTokens(member: IntegrationMember) {
    const role = await orgMember(member);
    const rows = await db
      .prepare(
        `SELECT id,label,capabilities_json,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt,last_used_at AS lastUsedAt FROM integration_organization_tokens WHERE organization_id=? AND (user_id=? OR ?='owner') ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(member.organizationId, member.userId, role)
      .all<{ id: string; label: string; capabilities_json: string }>();
    return rows.results.map(({ capabilities_json, ...token }) => ({
      ...token,
      scope: "organization",
      capabilities: JSON.parse(capabilities_json),
    }));
  }
  async function revokeOrganizationToken(
    member: IntegrationMember,
    id: string,
  ) {
    const role = await orgMember(member);
    const r = await db
      .prepare(
        `UPDATE integration_organization_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND organization_id=? AND (user_id=? OR ?='owner')`,
      )
      .bind(h.now(), id, member.organizationId, member.userId, role)
      .run();
    if (r.meta.changes !== 1)
      throw new IntegrationError(
        404,
        "token_not_found",
        "Connexion introuvable.",
      );
  }
  async function readCatalog(c: IntegrationTokenContext) {
    // Existing organizations get their first revision during a normal authenticated operation.
    // Schema creation remains migration-only; this is a bounded, idempotent data insert.
    await db
      .prepare(
        `INSERT OR IGNORE INTO integration_organization_revisions(organization_id,revision)
      SELECT t.organization_id,0 FROM integration_credentials t
      JOIN organization_members m ON m.user_id=t.user_id AND m.organization_id=t.organization_id
      WHERE t.id=? AND t.organization_id=? AND t.revoked_at IS NULL AND t.expires_at>?`,
      )
      .bind(c.id, c.organizationId, h.now())
      .run();
    const rows = await db.batch([
      db
        .prepare(
          `SELECT v.revision FROM integration_organization_revisions v JOIN integration_credentials t ON t.organization_id=v.organization_id JOIN organization_members m ON m.user_id=t.user_id AND m.organization_id=t.organization_id WHERE v.organization_id=? AND t.id=? AND t.revoked_at IS NULL AND t.expires_at>?`,
        )
        .bind(c.organizationId, c.id, h.now()),
      db
        .prepare(
          "SELECT id,name,description FROM client_projects WHERE organization_id=? AND (? IS NULL OR id=?) ORDER BY updated_at DESC,id DESC LIMIT 201",
        )
        .bind(c.organizationId, c.projectId, c.projectId),
    ]);
    const v = rows[0].results[0] as { revision: number } | undefined;
    if (!v) throw invalid();
    const instanceId = await h.instanceId();
    return {
      revision: v.revision,
      catalog: {
        apiVersion: "1" as const,
        instanceId,
        organizationId: c.organizationId,
        version: await integrationDigest(
          `${instanceId}:organization:${c.organizationId}:${v.revision}`,
        ),
        projects: rows[1].results.slice(0, 200) as Array<{
          id: string;
          name: string;
          description: string;
        }>,
        limited: rows[1].results.length > 200,
      },
    };
  }
  function releaseOperations(
    c: IntegrationTokenContext,
    projectId: string,
    releaseId: string,
    r: WorkflowRelease,
    at: string,
    guard: string,
    params: string[],
  ) {
    const expiresAt = new Date(
      Date.parse(at) + r.expiresInDays * 86400000,
    ).toISOString();
    const statements = [
      db
        .prepare(
          `INSERT INTO review_releases(id,project_id,version,title,commit_sha,status,preview_kind,preview_url,reviewer_message,feedback_sequence,preview_revision,created_by,created_at,updated_at,expires_at,closed_at) SELECT ?,?,?,?,?,'in_review','external',?,?,0,0,?,?,?,?,NULL WHERE ${guard}`,
        )
        .bind(
          releaseId,
          projectId,
          r.version,
          r.title,
          r.commitSha,
          r.previewUrl,
          r.reviewerMessage,
          c.userId,
          at,
          at,
          expiresAt,
          ...params,
        ),
    ];
    for (const [position, item] of r.testItems.entries())
      statements.push(
        db
          .prepare(
            `INSERT INTO review_test_items(id,release_id,position,title,description,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
          )
          .bind(
            `test_${crypto.randomUUID()}`,
            releaseId,
            position,
            item.title,
            item.description,
            at,
            ...params,
          ),
      );
    return statements;
  }
  function audit(
    c: IntegrationTokenContext,
    projectId: string,
    releaseId: string | null,
    requestId: string,
    type: string,
    at: string,
    guard: string,
    params: string[],
  ) {
    return db
      .prepare(
        `INSERT INTO audit_events(id,organization_id,project_id,release_id,actor_type,actor_id,action,metadata_json,created_at) SELECT ?,?,?,?,'developer',?,'integration.command',?,? WHERE ${guard}`,
      )
      .bind(
        crypto.randomUUID(),
        c.organizationId,
        projectId,
        releaseId,
        c.userId,
        JSON.stringify({ tokenId: c.id, requestId, type }),
        at,
        ...params,
      );
  }
  async function createProject(
    c: IntegrationTokenContext,
    input: Envelope<unknown>,
  ) {
    envelope(input);
    const command = parseProjectCreation(input.command);
    if (
      c.scope !== "organization" ||
      !c.capabilities.includes("projects:write") ||
      !c.capabilities.includes("releases:write")
    )
      throw denied();
    const fingerprint = await integrationDigest(
      JSON.stringify({
        actor: c.userId,
        expectedVersion: input.expectedVersion,
        command,
      }),
    );
    const previous = async () => {
      const row = await db
        .prepare(
          "SELECT fingerprint,result_json FROM integration_organization_receipts WHERE organization_id=? AND request_id=?",
        )
        .bind(c.organizationId, input.requestId)
        .first<{ fingerprint: string; result_json: string }>();
      if (!row) return null;
      if (row.fingerprint !== fingerprint)
        throw new IntegrationError(
          409,
          "idempotency_conflict",
          "Cet identifiant a déjà servi à une autre commande.",
        );
      const result = JSON.parse(row.result_json) as { projectId: string };
      return {
        requestId: input.requestId,
        alreadyApplied: true,
        result,
        snapshot: (await h.readSnapshot(c, result.projectId)).snapshot,
      };
    };
    const prior = await previous();
    if (prior) return prior;
    const { catalog, revision } = await readCatalog(c);
    if (catalog.version !== input.expectedVersion) throw stale();
    const at = h.now(),
      execution = crypto.randomUUID(),
      projectId = `project_${crypto.randomUUID()}`,
      releaseId = `release_${crypto.randomUUID()}`,
      result = { type: command.type, projectId, releaseId };
    const guard =
        "EXISTS(SELECT 1 FROM integration_organization_receipts WHERE organization_id=? AND request_id=? AND execution_id=?)",
      params = [c.organizationId, input.requestId, execution];
    const receipt = db
      .prepare(
        `INSERT OR IGNORE INTO integration_organization_receipts(organization_id,request_id,fingerprint,execution_id,result_json,created_at) SELECT ?,?,?,?,?,? FROM integration_organization_revisions v JOIN integration_organization_tokens t ON t.organization_id=v.organization_id JOIN organization_members m ON m.user_id=t.user_id AND m.organization_id=t.organization_id WHERE v.organization_id=? AND v.revision=? AND t.id=? AND t.revoked_at IS NULL AND t.expires_at>? AND (SELECT COUNT(*) FROM integration_organization_receipts WHERE organization_id=?)<10000`,
      )
      .bind(
        c.organizationId,
        input.requestId,
        fingerprint,
        execution,
        JSON.stringify(result),
        at,
        c.organizationId,
        revision,
        c.id,
        at,
        c.organizationId,
      );
    const project = db
      .prepare(
        `INSERT INTO client_projects(id,organization_id,slug,name,description,accent,created_at,updated_at) SELECT ?,?,?,?,?,'#ddebec',?,? WHERE ${guard}`,
      )
      .bind(
        projectId,
        c.organizationId,
        `project-${crypto.randomUUID()}`,
        command.name,
        command.description,
        at,
        at,
        ...params,
      );
    const rows = await db.batch([
      receipt,
      project,
      ...releaseOperations(
        c,
        projectId,
        releaseId,
        command.release,
        at,
        guard,
        params,
      ),
      audit(
        c,
        projectId,
        releaseId,
        input.requestId,
        command.type,
        at,
        guard,
        params,
      ),
    ]);
    if (rows[0].meta.changes !== 1) {
      const replay = await previous();
      if (replay) return replay;
      throw stale();
    }
    return {
      requestId: input.requestId,
      alreadyApplied: false,
      result,
      snapshot: (await h.readSnapshot(c, projectId)).snapshot,
    };
  }
  async function projectCommand(
    c: IntegrationTokenContext,
    projectId: string,
    input: Envelope<WorkflowCommand>,
  ) {
    envelope(input);
    const command = parseWorkflowCommand(input.command);
    const capability =
      command.type === "release.create"
        ? "releases:write"
        : command.type === "preview.update"
          ? "preview:write"
          : "invitations:write";
    if (!c.capabilities.includes(capability)) throw denied();
    if (c.scope !== "organization" && c.projectId !== projectId)
      throw new IntegrationError(
        404,
        "project_not_found",
        "Projet introuvable.",
      );
    const fingerprint = await integrationDigest(
      JSON.stringify({
        actor: c.userId,
        expectedVersion: input.expectedVersion,
        command,
      }),
    );
    const previous = async () => {
      const row = await db
        .prepare(
          "SELECT fingerprint,result_json FROM integration_command_receipts WHERE project_id=? AND request_id=?",
        )
        .bind(projectId, input.requestId)
        .first<{ fingerprint: string; result_json: string }>();
      if (!row) return null;
      if (row.fingerprint !== fingerprint)
        throw new IntegrationError(
          409,
          "idempotency_conflict",
          "Cet identifiant a déjà servi à une autre commande.",
        );
      const result = JSON.parse(row.result_json) as Record<string, unknown>;
      return {
        requestId: input.requestId,
        alreadyApplied: true,
        result: {
          ...result,
          ...(command.type === "invitation.create"
            ? { secretUnavailable: true }
            : {}),
        },
        snapshot: (await h.readSnapshot(c, projectId)).snapshot,
      };
    };
    const prior = await previous();
    if (prior) return prior;
    const { snapshot, revision } = await h.readSnapshot(c, projectId);
    if (snapshot.version !== input.expectedVersion) throw stale();
    const at = h.now(),
      execution = crypto.randomUUID(),
      params = [projectId, input.requestId, execution];
    let eligibility: string,
      eligibilityParams: Array<string | number>,
      releaseId: string,
      result: Record<string, unknown>,
      invitePath: string | undefined;
    const operations: D1PreparedStatement[] = [];
    if (command.type === "release.create") {
      if (
        snapshot.releases.some(
          (r) =>
            ["in_review", "changes_requested"].includes(r.status) &&
            r.expiresAt > at,
        )
      )
        throw new IntegrationError(
          409,
          "active_release",
          "La version actuelle doit être approuvée ou expirer avant d’en publier une nouvelle.",
        );
      releaseId = `release_${crypto.randomUUID()}`;
      eligibility = `NOT EXISTS(SELECT 1 FROM review_releases WHERE project_id=? AND status IN ('in_review','changes_requested') AND expires_at>?) AND NOT EXISTS(SELECT 1 FROM review_releases WHERE project_id=? AND version=?)`;
      eligibilityParams = [projectId, at, projectId, command.release.version];
      result = { type: command.type, projectId, releaseId };
      operations.push(
        db
          .prepare(
            `UPDATE review_invitations SET revoked_at=? WHERE revoked_at IS NULL AND release_id IN(SELECT id FROM review_releases WHERE project_id=?) AND ${receiptGuard}`,
          )
          .bind(at, projectId, ...params),
        db
          .prepare(
            `UPDATE reviewer_sessions SET revoked_at=? WHERE revoked_at IS NULL AND release_id IN(SELECT id FROM review_releases WHERE project_id=?) AND ${receiptGuard}`,
          )
          .bind(at, projectId, ...params),
        db
          .prepare(
            `UPDATE review_releases SET status='superseded',closed_at=?,updated_at=? WHERE project_id=? AND status IN ('in_review','changes_requested') AND ${receiptGuard}`,
          )
          .bind(at, at, projectId, ...params),
        ...releaseOperations(
          c,
          projectId,
          releaseId,
          command.release,
          at,
          receiptGuard,
          params,
        ),
      );
    } else {
      releaseId = command.releaseId;
      const release = snapshot.releases.find((r) => r.id === releaseId);
      if (!release)
        throw new IntegrationError(
          404,
          "release_not_found",
          "Version introuvable.",
        );
      const active = command.type !== "invitation.revoke";
      if (
        active &&
        (!["in_review", "changes_requested"].includes(release.status) ||
          release.expiresAt <= at)
      )
        throw new IntegrationError(
          409,
          "inactive_release",
          "Cette version est clôturée ou expirée.",
        );
      eligibility = `EXISTS(SELECT 1 FROM review_releases WHERE id=? AND project_id=?${active ? " AND status IN ('in_review','changes_requested') AND expires_at>?" : ""})`;
      eligibilityParams = [releaseId, projectId, ...(active ? [at] : [])];
      if (command.type === "invitation.create") {
        if (!command.replaceExisting) {
          eligibility +=
            " AND NOT EXISTS(SELECT 1 FROM review_invitations WHERE release_id=? AND revoked_at IS NULL AND expires_at>?)";
          eligibilityParams.push(releaseId, at);
          if (
            snapshot.invitations.some(
              (i) =>
                i.releaseId === releaseId && !i.revokedAt && i.expiresAt > at,
            )
          )
            throw new IntegrationError(
              409,
              "invitation_exists",
              "Une invitation existe déjà. Confirmez explicitement son remplacement.",
            );
        }
        const invitationId = `invite_${crypto.randomUUID()}`,
          invitationSecret = secret(),
          expiresAt = new Date(
            Math.min(
              Date.parse(release.expiresAt),
              Date.parse(at) + command.expiresInDays * 86400000,
            ),
          ).toISOString();
        result = {
          type: command.type,
          projectId,
          releaseId,
          invitationId,
          expiresAt,
        };
        invitePath = `/join#token=${invitationSecret}`;
        operations.push(
          db
            .prepare(
              `UPDATE review_invitations SET revoked_at=? WHERE release_id=? AND revoked_at IS NULL AND ${receiptGuard}`,
            )
            .bind(at, releaseId, ...params),
          db
            .prepare(
              `UPDATE reviewer_sessions SET revoked_at=? WHERE release_id=? AND revoked_at IS NULL AND ${receiptGuard}`,
            )
            .bind(at, releaseId, ...params),
          db
            .prepare(
              `INSERT INTO review_invitations(id,release_id,token_hash,reviewer_name,reviewer_email,created_by,created_at,expires_at,used_at,revoked_at) SELECT ?,?,?,?,?,?,?,?,NULL,NULL WHERE ${receiptGuard}`,
            )
            .bind(
              invitationId,
              releaseId,
              await integrationDigest(invitationSecret),
              command.reviewerName,
              command.reviewerEmail,
              c.userId,
              at,
              expiresAt,
              ...params,
            ),
        );
      } else if (command.type === "invitation.revoke") {
        result = { type: command.type, projectId, releaseId, revokedAt: at };
        operations.push(
          db
            .prepare(
              `UPDATE review_invitations SET revoked_at=? WHERE release_id=? AND revoked_at IS NULL AND ${receiptGuard}`,
            )
            .bind(at, releaseId, ...params),
          db
            .prepare(
              `UPDATE reviewer_sessions SET revoked_at=? WHERE release_id=? AND revoked_at IS NULL AND ${receiptGuard}`,
            )
            .bind(at, releaseId, ...params),
        );
      } else {
        result = {
          type: command.type,
          projectId,
          releaseId,
          previewUrl: command.previewUrl ?? release.previewUrl,
          previewRevision: release.previewRevision + 1,
          updatedAt: at,
        };
        operations.push(
          db
            .prepare(
              `UPDATE review_releases SET preview_url=COALESCE(?,preview_url),preview_revision=preview_revision+1,updated_at=? WHERE id=? AND ${receiptGuard}`,
            )
            .bind(command.previewUrl ?? null, at, releaseId, ...params),
        );
      }
    }
    const receipt = db
      .prepare(
        `INSERT OR IGNORE INTO integration_command_receipts(project_id,request_id,fingerprint,execution_id,result_json,created_at) SELECT ?,?,?,?,?,? FROM integration_project_revisions v JOIN client_projects p ON p.id=v.project_id JOIN integration_credentials t ON t.organization_id=p.organization_id AND (t.project_id=p.id OR t.scope='organization') JOIN organization_members m ON m.user_id=t.user_id AND m.organization_id=t.organization_id WHERE v.project_id=? AND v.revision=? AND t.id=? AND t.revoked_at IS NULL AND t.expires_at>? AND ${eligibility} AND (SELECT COUNT(*) FROM integration_command_receipts WHERE project_id=?)<10000`,
      )
      .bind(
        projectId,
        input.requestId,
        fingerprint,
        execution,
        JSON.stringify(result),
        at,
        projectId,
        revision,
        c.id,
        at,
        ...eligibilityParams,
        projectId,
      );
    // Always touch the project: revocation with no current invitation must also consume the reviewed version.
    operations.push(
      db
        .prepare(
          `UPDATE client_projects SET updated_at=? WHERE id=? AND ${receiptGuard}`,
        )
        .bind(at, projectId, ...params),
    );
    const rows = await db.batch([
      receipt,
      ...operations,
      audit(
        c,
        projectId,
        releaseId,
        input.requestId,
        command.type,
        at,
        receiptGuard,
        params,
      ),
    ]);
    if (rows[0].meta.changes !== 1) {
      const replay = await previous();
      if (replay) return replay;
      throw stale();
    }
    return {
      requestId: input.requestId,
      alreadyApplied: false,
      result: { ...result, ...(invitePath ? { invitePath } : {}) },
      snapshot: (await h.readSnapshot(c, projectId)).snapshot,
    };
  }
  return {
    createOrganizationToken,
    listOrganizationTokens,
    revokeOrganizationToken,
    catalog: async (c: IntegrationTokenContext) =>
      (await readCatalog(c)).catalog,
    createProject,
    projectCommand,
  };
}
