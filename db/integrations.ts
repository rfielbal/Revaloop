import { createIntegrationWorkflow } from "./integration-workflow";
import {
  IntegrationError,
  integrationApiVersion,
  integrationDigest,
  integrationReadCapabilities,
  integrationWriteCapabilities,
  integrationLifecycleCapabilities,
  parseIntegrationCommand,
  type IntegrationCapability,
  type IntegrationCommand,
} from "../lib/integration-contract";

export type IntegrationMember = {
  userId: string;
  organizationId: string;
  role: "owner" | "developer";
};
export type IntegrationTokenContext = {
  id: string;
  userId: string;
  organizationId: string;
  projectId: string | null;
  projectName: string | null;
  scope: "project" | "organization";
  displayName: string;
  capabilities: IntegrationCapability[];
};
export type IntegrationSnapshot = {
  apiVersion: "1";
  instanceId: string;
  organizationId: string;
  version: string;
  fetchedAt: string;
  project: { id: string; name: string; description: string };
  releases: Array<{
    id: string;
    version: string;
    title: string;
    status: string;
    commitSha: string;
    previewUrl: string;
    previewRevision: number;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    reviewerMessage: string;
    testItems: Array<{
      id: string;
      title: string;
      description: string;
      position: number;
    }>;
  }>;
  feedback: Array<{
    id: string;
    releaseId: string;
    sequence: number;
    title: string;
    body: string;
    status: string;
    priority: string;
    route: string;
    createdAt: string;
    updatedAt: string;
  }>;
  messages: Array<{
    id: string;
    releaseId: string;
    body: string;
    authorRole: string;
    authorName: string;
    createdAt: string;
  }>;
  decisions: Array<{
    id: string;
    releaseId: string;
    decision: string;
    comment: string;
    authorName: string;
    createdAt: string;
  }>;
  invitations: Array<{
    id: string;
    releaseId: string;
    reviewerName: string;
    expiresAt: string;
    revokedAt: string | null;
    usedAt: string | null;
  }>;
  limited: boolean;
};
type Receipt = { fingerprint: string; result_json: string };
const invalidToken = () =>
  new IntegrationError(
    401,
    "invalid_token",
    "Cette connexion est expirée, révoquée ou invalide.",
  );
const conflict = () =>
  new IntegrationError(
    409,
    "stale_snapshot",
    "La recette a changé. Actualisez-la avant de réessayer.",
  );
const rowId = (id: string) => /^[A-Za-z0-9_-]{1,120}$/.test(id);

export function createIntegrationService(
  db: D1Database,
  now = () => new Date().toISOString(),
) {
  async function authorizeProject(
    member: IntegrationMember,
    projectId: string,
  ) {
    if (!rowId(projectId))
      throw new IntegrationError(400, "invalid_project", "Projet invalide.");
    const project = await db
      .prepare(
        `SELECT p.id FROM client_projects p
      JOIN organization_members m ON m.organization_id = p.organization_id
      WHERE p.id = ? AND p.organization_id = ? AND m.user_id = ? LIMIT 1`,
      )
      .bind(projectId, member.organizationId, member.userId)
      .first();
    if (!project)
      throw new IntegrationError(
        404,
        "project_not_found",
        "Projet introuvable.",
      );
  }
  async function authenticate(
    secret: string,
  ): Promise<IntegrationTokenContext> {
    if (!/^rv[io]_[A-Za-z0-9_-]{43}$/.test(secret)) throw invalidToken();
    const token = await db
      .prepare(
        `SELECT t.id, t.user_id, t.organization_id, t.project_id, t.capabilities_json,
      u.display_name, p.name AS project_name, t.scope FROM integration_credentials t
      JOIN app_users u ON u.id = t.user_id
      LEFT JOIN client_projects p ON p.id = t.project_id AND p.organization_id = t.organization_id
      JOIN organization_members m ON m.user_id = t.user_id AND m.organization_id = t.organization_id
      WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > ? AND (t.scope='organization' OR p.id IS NOT NULL) LIMIT 1`,
      )
      .bind(await integrationDigest(secret), now())
      .first<{
        id: string;
        user_id: string;
        organization_id: string;
        project_id: string | null;
        capabilities_json: string;
        display_name: string;
        project_name: string | null;
        scope: "project" | "organization";
      }>();
    if (!token) throw invalidToken();
    let capabilities: IntegrationCapability[];
    try {
      capabilities = JSON.parse(token.capabilities_json);
    } catch {
      throw invalidToken();
    }
    if (
      !Array.isArray(capabilities) ||
      !integrationReadCapabilities.every((scope) =>
        capabilities.includes(scope),
      ) ||
      capabilities.some(
        (scope) =>
          ![
            ...integrationReadCapabilities,
            ...integrationWriteCapabilities,
            ...integrationLifecycleCapabilities,
          ].includes(scope),
      )
    )
      throw invalidToken();
    await db
      .prepare(
        `UPDATE ${token.scope === "organization" ? "integration_organization_tokens" : "integration_tokens"} SET last_used_at = ? WHERE id = ?`,
      )
      .bind(now(), token.id)
      .run();
    return {
      id: token.id,
      scope: token.scope,
      userId: token.user_id,
      organizationId: token.organization_id,
      projectId: token.project_id,
      projectName: token.project_name,
      displayName: token.display_name,
      capabilities,
    };
  }
  async function instanceId() {
    const row = await db
      .prepare("SELECT id FROM integration_instance WHERE singleton = 1")
      .first<{ id: string }>();
    if (!row)
      throw new IntegrationError(
        503,
        "unavailable",
        "L’intégration n’est pas initialisée.",
      );
    return row.id;
  }
  async function capabilities(context: IntegrationTokenContext) {
    return {
      apiVersion: integrationApiVersion,
      instanceId: await instanceId(),
      organizationId: context.organizationId,
      scope: context.scope,
      project: context.projectId
        ? { id: context.projectId, name: context.projectName }
        : null,
      capabilities: context.capabilities,
    };
  }
  async function readSnapshot(
    context: IntegrationTokenContext,
    projectId: string,
  ) {
    if (context.scope !== "organization" && projectId !== context.projectId)
      throw new IntegrationError(
        404,
        "project_not_found",
        "Projet introuvable pour cette connexion.",
      );
    const at = now();
    // A D1 batch supplies one coherent view of the revision and the selected rows.
    const queries = [
      db
        .prepare(
          `SELECT p.id, p.name, p.description, v.revision FROM client_projects p
        JOIN integration_project_revisions v ON v.project_id=p.id
        JOIN integration_credentials t ON (t.project_id=p.id OR t.scope='organization') AND t.organization_id=p.organization_id
        JOIN organization_members m ON m.user_id=t.user_id AND m.organization_id=t.organization_id
        WHERE p.id=? AND t.id=? AND t.revoked_at IS NULL AND t.expires_at>?`,
        )
        .bind(projectId, context.id, at),
      db
        .prepare(
          `SELECT id, version, title, status, commit_sha AS commitSha, preview_url AS previewUrl,
        reviewer_message AS reviewerMessage, preview_revision AS previewRevision, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt
        FROM review_releases WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 101`,
        )
        .bind(projectId),
      db
        .prepare(
          `SELECT f.id, f.release_id AS releaseId, f.sequence, f.title, f.body, f.status, f.priority,
        f.page_path AS route, f.created_at AS createdAt, f.updated_at AS updatedAt
        FROM review_feedback f JOIN review_releases r ON r.id=f.release_id WHERE r.project_id=?
        AND r.id IN (SELECT id FROM review_releases WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100)
        ORDER BY f.created_at DESC,f.id DESC LIMIT 1001`,
        )
        .bind(projectId, projectId),
      db
        .prepare(
          `SELECT m.id,m.release_id AS releaseId,m.body,m.author_type AS authorRole,m.author_name AS authorName,m.created_at AS createdAt
        FROM release_messages m JOIN review_releases r ON r.id=m.release_id WHERE r.project_id=?
        AND r.id IN (SELECT id FROM review_releases WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100)
        ORDER BY m.created_at DESC,m.id DESC LIMIT 1001`,
        )
        .bind(projectId, projectId),
      db
        .prepare(
          `SELECT d.id,d.release_id AS releaseId,d.status AS decision,d.note AS comment,d.author_name AS authorName,d.created_at AS createdAt
        FROM review_decisions d JOIN review_releases r ON r.id=d.release_id WHERE r.project_id=?
        AND r.id IN (SELECT id FROM review_releases WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100)
        ORDER BY d.created_at DESC,d.id DESC LIMIT 101`,
        )
        .bind(projectId, projectId),
      db
        .prepare(
          `SELECT i.id,i.release_id AS releaseId,i.reviewer_name AS reviewerName,i.expires_at AS expiresAt,i.revoked_at AS revokedAt,i.used_at AS usedAt FROM review_invitations i JOIN review_releases r ON r.id=i.release_id WHERE r.project_id=? AND r.id IN (SELECT id FROM review_releases WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100) ORDER BY i.created_at DESC,i.id DESC LIMIT 1001`,
        )
        .bind(projectId, projectId),
      db
        .prepare(
          `SELECT i.id,i.release_id AS releaseId,i.title,i.description,i.position FROM review_test_items i JOIN review_releases r ON r.id=i.release_id WHERE r.project_id=? AND r.id IN (SELECT id FROM review_releases WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100) ORDER BY i.position,i.id LIMIT 1201`,
        )
        .bind(projectId, projectId),
    ];
    const rows = await db.batch<Record<string, unknown>>(queries);
    const project = rows[0].results[0] as
      | { id: string; name: string; description: string; revision: number }
      | undefined;
    if (!project) throw invalidToken();
    const instance = await instanceId();
    const snapshot: IntegrationSnapshot = {
      apiVersion: integrationApiVersion,
      instanceId: instance,
      organizationId: context.organizationId,
      version: await integrationDigest(
        `${instance}:${projectId}:${project.revision}`,
      ),
      fetchedAt: at,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      releases: rows[1].results.slice(0, 100).map((row) => ({
        ...row,
        testItems: rows[6].results
          .filter((item) => item.releaseId === row.id)
          .map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            position: item.position,
          })),
      })) as IntegrationSnapshot["releases"],
      feedback: rows[2].results.slice(
        0,
        1000,
      ) as IntegrationSnapshot["feedback"],
      messages: rows[3].results.slice(
        0,
        1000,
      ) as IntegrationSnapshot["messages"],
      decisions: rows[4].results.slice(
        0,
        100,
      ) as IntegrationSnapshot["decisions"],
      invitations: rows[5].results.slice(
        0,
        1000,
      ) as IntegrationSnapshot["invitations"],
      limited:
        rows[5].results.length > 1000 ||
        rows[6].results.length > 1200 ||
        rows[1].results.length > 100 ||
        rows[2].results.length > 1000 ||
        rows[3].results.length > 1000 ||
        rows[4].results.length > 100,
    };
    return { snapshot, revision: project.revision };
  }
  async function listTokens(member: IntegrationMember, projectId: string) {
    await authorizeProject(member, projectId);
    const rows = await db
      .prepare(
        `SELECT id,label,capabilities_json,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt,last_used_at AS lastUsedAt,user_id AS userId
      FROM integration_tokens WHERE project_id=? AND organization_id=? AND (user_id=? OR ?='owner') ORDER BY created_at DESC LIMIT 100`,
      )
      .bind(projectId, member.organizationId, member.userId, member.role)
      .all<{
        id: string;
        label: string;
        capabilities_json: string;
        createdAt: string;
        expiresAt: string;
        revokedAt: string | null;
        lastUsedAt: string | null;
        userId: string;
      }>();
    return rows.results.map(({ capabilities_json, ...token }) => ({
      ...token,
      capabilities: JSON.parse(capabilities_json) as IntegrationCapability[],
    }));
  }
  async function createToken(
    member: IntegrationMember,
    input: {
      projectId: string;
      label: string;
      write: boolean;
      expiresInDays: number;
    },
  ) {
    await authorizeProject(member, input.projectId);
    const count = await db
      .prepare(
        "SELECT COUNT(*) AS total FROM integration_tokens WHERE project_id=? AND revoked_at IS NULL AND expires_at>?",
      )
      .bind(input.projectId, now())
      .first<{ total: number }>();
    if ((count?.total ?? 0) >= 20)
      throw new IntegrationError(
        409,
        "token_limit",
        "Révoquez une connexion avant d’en créer une nouvelle.",
      );
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = `rvi_${btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "")}`;
    const tokenId = `integration_${crypto.randomUUID()}`;
    const at = now();
    const expiresAt = new Date(
      Date.parse(at) + input.expiresInDays * 86400000,
    ).toISOString();
    const allowed = [
      ...integrationReadCapabilities,
      ...(input.write ? integrationWriteCapabilities : []),
    ];
    await db
      .prepare(
        `INSERT INTO integration_tokens(id,token_hash,user_id,organization_id,project_id,label,capabilities_json,created_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        tokenId,
        await integrationDigest(secret),
        member.userId,
        member.organizationId,
        input.projectId,
        input.label,
        JSON.stringify(allowed),
        at,
        expiresAt,
      )
      .run();
    return {
      id: tokenId,
      token: secret,
      projectId: input.projectId,
      capabilities: allowed,
      expiresAt,
    };
  }
  async function revokeToken(
    member: IntegrationMember,
    projectId: string,
    tokenId: string,
  ) {
    await authorizeProject(member, projectId);
    const result = await db
      .prepare(
        `UPDATE integration_tokens SET revoked_at=COALESCE(revoked_at,?)
      WHERE id=? AND project_id=? AND organization_id=? AND (user_id=? OR ?='owner')`,
      )
      .bind(
        now(),
        tokenId,
        projectId,
        member.organizationId,
        member.userId,
        member.role,
      )
      .run();
    if (result.meta.changes !== 1)
      throw new IntegrationError(
        404,
        "token_not_found",
        "Connexion introuvable.",
      );
  }
  async function command(
    context: IntegrationTokenContext,
    projectId: string,
    input: {
      requestId: string;
      expectedVersion: string;
      command: IntegrationCommand;
    },
  ) {
    input = parseIntegrationCommand({ ...input });
    if (
      input.command.type !== "feedback.transition" &&
      input.command.type !== "message.create"
    )
      return workflow.projectCommand(context, projectId, {
        ...input,
        command: input.command,
      });
    if (context.scope !== "organization" && projectId !== context.projectId)
      throw new IntegrationError(
        404,
        "project_not_found",
        "Projet introuvable pour cette connexion.",
      );
    const capability =
      input.command.type === "feedback.transition"
        ? "feedback:write"
        : "messages:write";
    if (!context.capabilities.includes(capability))
      throw new IntegrationError(
        403,
        "scope_denied",
        "Cette connexion est en lecture seule.",
      );
    const fingerprint = await integrationDigest(
      JSON.stringify({
        actor: context.userId,
        version: input.expectedVersion,
        command: input.command,
      }),
    );
    async function previous() {
      const receipt = await db
        .prepare(
          "SELECT fingerprint,result_json FROM integration_command_receipts WHERE project_id=? AND request_id=?",
        )
        .bind(projectId, input.requestId)
        .first<Receipt>();
      if (!receipt) return null;
      if (receipt.fingerprint !== fingerprint)
        throw new IntegrationError(
          409,
          "idempotency_conflict",
          "Cet identifiant a déjà servi à une autre commande.",
        );
      return {
        requestId: input.requestId,
        alreadyApplied: true,
        result: JSON.parse(receipt.result_json) as Record<string, unknown>,
        snapshot: (await readSnapshot(context, projectId)).snapshot,
      };
    }
    const existing = await previous();
    if (existing) return existing;
    const { snapshot, revision } = await readSnapshot(context, projectId);
    if (snapshot.version !== input.expectedVersion) throw conflict();
    const at = now(),
      execution = crypto.randomUUID();
    const update = input.command;
    let releaseId: string,
      eligibility: string,
      eligibilityParams: Array<string | number>,
      result: Record<string, unknown>,
      operation: D1PreparedStatement;
    const receiptGuard =
      "EXISTS (SELECT 1 FROM integration_command_receipts WHERE project_id=? AND request_id=? AND execution_id=?)";
    if (update.type === "feedback.transition") {
      const feedback = snapshot.feedback.find(
        (row) => row.id === update.feedbackId,
      );
      const from = update.status === "in_progress" ? "open" : "in_progress";
      if (!feedback || feedback.status !== from)
        throw new IntegrationError(
          409,
          "invalid_transition",
          "Cette transition développeur est refusée.",
        );
      releaseId = feedback.releaseId;
      eligibility =
        "EXISTS(SELECT 1 FROM review_feedback f JOIN review_releases r ON r.id=f.release_id WHERE f.id=? AND f.status=? AND r.project_id=? AND r.status IN ('in_review','changes_requested') AND r.expires_at>?)";
      eligibilityParams = [feedback.id, from, projectId, at];
      result = {
        type: update.type,
        id: feedback.id,
        releaseId,
        status: update.status,
        updatedAt: at,
      };
      operation = db
        .prepare(
          `UPDATE review_feedback SET status=?,updated_at=? WHERE id=? AND ${receiptGuard}`,
        )
        .bind(
          update.status,
          at,
          feedback.id,
          projectId,
          input.requestId,
          execution,
        );
    } else {
      releaseId = update.releaseId;
      if (!snapshot.releases.some((row) => row.id === releaseId))
        throw new IntegrationError(
          404,
          "release_not_found",
          "Version introuvable pour cette connexion.",
        );
      eligibility =
        "EXISTS(SELECT 1 FROM review_releases r WHERE r.id=? AND r.project_id=? AND r.status IN ('in_review','changes_requested') AND r.expires_at>?)";
      eligibilityParams = [releaseId, projectId, at];
      const messageId = `message_${crypto.randomUUID()}`;
      result = {
        type: update.type,
        id: messageId,
        releaseId,
        body: update.body,
        authorRole: "developer",
        authorName: context.displayName,
        createdAt: at,
      };
      operation = db
        .prepare(
          `INSERT INTO release_messages(id,release_id,author_type,author_user_id,author_session_id,author_name,body,created_at)
        SELECT ?,?,'developer',?,NULL,?,?,? WHERE ${receiptGuard}`,
        )
        .bind(
          messageId,
          releaseId,
          context.userId,
          context.displayName,
          update.body,
          at,
          projectId,
          input.requestId,
          execution,
        );
    }
    const receipt = db
      .prepare(
        `INSERT OR IGNORE INTO integration_command_receipts(project_id,request_id,fingerprint,execution_id,result_json,created_at)
      SELECT ?,?,?,?,?,? FROM integration_project_revisions v
      JOIN integration_credentials t ON (t.project_id=v.project_id OR t.scope='organization')
      JOIN organization_members m ON m.user_id=t.user_id AND m.organization_id=t.organization_id
      JOIN client_projects p ON p.id=v.project_id AND p.organization_id=t.organization_id
      WHERE v.project_id=? AND v.revision=? AND t.id=? AND t.revoked_at IS NULL AND t.expires_at>?
      AND ${eligibility}
      AND (SELECT COUNT(*) FROM integration_command_receipts WHERE project_id=?) < 10000`,
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
        context.id,
        at,
        ...eligibilityParams,
        projectId,
      );
    const audit = db
      .prepare(
        `INSERT INTO audit_events(id,organization_id,project_id,release_id,actor_type,actor_id,action,metadata_json,created_at)
      SELECT ?,?,?,?,'developer',?,'integration.command',?,? WHERE ${receiptGuard}`,
      )
      .bind(
        crypto.randomUUID(),
        context.organizationId,
        projectId,
        releaseId,
        context.userId,
        JSON.stringify({
          tokenId: context.id,
          requestId: input.requestId,
          type: update.type,
          targetId: result.id,
        }),
        at,
        projectId,
        input.requestId,
        execution,
      );
    const executed = await db.batch([receipt, operation, audit]);
    if (executed[0].meta.changes !== 1) {
      const repeated = await previous();
      if (repeated) return repeated;
      throw conflict();
    }
    if (executed[1].meta.changes < 1)
      throw new IntegrationError(
        503,
        "uncertain_result",
        "Vérifiez la recette avant de renvoyer cette commande.",
      );
    return {
      requestId: input.requestId,
      alreadyApplied: false,
      result,
      snapshot: (await readSnapshot(context, projectId)).snapshot,
    };
  }
  const workflow = createIntegrationWorkflow(db, {
    now,
    readSnapshot,
    instanceId,
  });
  return {
    ...workflow,
    authenticate,
    capabilities,
    snapshot: async (context: IntegrationTokenContext, id: string) =>
      (await readSnapshot(context, id)).snapshot,
    listTokens,
    createToken,
    revokeToken,
    command,
  };
}
