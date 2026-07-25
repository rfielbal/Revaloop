import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

function between(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  assert.notEqual(start, -1, `Marqueur de début absent : ${startMarker}`);
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Marqueur de fin absent : ${endMarker}`);
  return content.slice(start, end);
}

function coordinateNormalizer(routeSource, field) {
  const match = routeSource.match(
    new RegExp(
      `${field}:\\s*typeof body\\.${field} === "number"\\s*\\?([\\s\\S]*?):\\s*null,`,
    ),
  );

  assert.ok(match?.[1], `Normalisation absente pour ${field}`);
  const expression = match[1].trim();

  assert.match(
    expression,
    new RegExp(
      `^Math\\.round\\(Math\\.min\\(100, Math\\.max\\(0, body\\.${field}\\)\\) \\* 100\\)\\s*\\/\\s*100$`,
    ),
  );

  return (value) =>
    Function(
      "body",
      `"use strict"; return (${expression});`,
    )({ [field]: value });
}

test("ne transmet ni n’affiche de catégorie imposée pour un retour client", async () => {
  const [reviewClient, dashboard] = await Promise.all([
    source("../app/review/[token]/review-client.tsx"),
    source("../app/dashboard/dashboard-client.tsx"),
  ]);
  const liveFeedbackPayload = reviewClient.match(
    /body:\s*JSON\.stringify\(\{\s*action:\s*"feedback",([\s\S]*?)\}\),/,
  )?.[1];

  assert.ok(liveFeedbackPayload, "Payload live de retour client introuvable");
  assert.doesNotMatch(liveFeedbackPayload, /\btype\s*:/);
  assert.doesNotMatch(liveFeedbackPayload, /\bpriority\s*:/);
  assert.doesNotMatch(
    reviewClient,
    />\s*(?:Affichage|Fonctionnement|Texte)\s*</i,
  );
  assert.doesNotMatch(reviewClient, /\btypeLabels\b/);

  assert.doesNotMatch(dashboard, /\btypeLabels\b/);
  assert.doesNotMatch(dashboard, /\b(?:item|selected)\.type\b/);
  assert.doesNotMatch(dashboard, /-\s*Type\s*:/);
  assert.doesNotMatch(dashboard, /-\s*Importance\s*:/);
  assert.doesNotMatch(dashboard, />\s*(?:Type|Importance)\s*</);
});

test("un retour général n’active pas le mode d’annotation visuelle", async () => {
  const reviewClient = await source(
    "../app/review/[token]/review-client.tsx",
  );
  const generalFeedbackHandler = between(
    reviewClient,
    "function openGeneralFeedback",
    "async function togglePreviewExpansion",
  );

  assert.match(generalFeedbackHandler, /setMode\("browse"\)/);
  assert.doesNotMatch(generalFeedbackHandler, /setMode\("comment"\)/);
  assert.match(
    generalFeedbackHandler,
    /general:\s*true/,
  );
});

test("le contrôle de visibilité du mot de passe reste hors de son libellé", async () => {
  const authForm = await source("../app/auth/auth-form.tsx");
  const passwordField = between(
    authForm,
    '<div className={styles.field}>',
    "{isRegistration ? (",
  );

  assert.match(
    passwordField,
    /<label htmlFor="auth-password">Mot de passe<\/label>/,
  );
  assert.match(passwordField, /id="auth-password"/);
  assert.match(passwordField, /aria-label=\{[\s\S]*Afficher le mot de passe/);
  assert.ok(
    passwordField.indexOf("</label>") <
      passwordField.indexOf("<button"),
    "Le libellé doit être fermé avant le bouton de visibilité.",
  );
});

test("conserve les coordonnées de 0 à 100 avec une précision au centième", async () => {
  const [reviewClient, reviewerRoute] = await Promise.all([
    source("../app/review/[token]/review-client.tsx"),
    source("../app/api/review/[token]/route.ts"),
  ]);
  const clickPlacement = between(
    reviewClient,
    "function handlePreviewClick",
    "function openCenteredAnnotation",
  );

  assert.match(
    clickPlacement,
    /x:\s*Math\.min\(100,\s*Math\.max\(0,\s*x\)\)/,
  );
  assert.match(
    clickPlacement,
    /y:\s*Math\.min\(100,\s*Math\.max\(0,\s*y\)\)/,
  );
  assert.doesNotMatch(clickPlacement, /Math\.min\(96|Math\.max\(4/);

  for (const field of ["positionX", "positionY"]) {
    const normalize = coordinateNormalizer(reviewerRoute, field);

    assert.equal(normalize(-3.456), 0);
    assert.equal(normalize(0.126), 0.13);
    assert.equal(normalize(1.23), 1.23);
    assert.equal(normalize(4.567), 4.57);
    assert.equal(normalize(96.789), 96.79);
    assert.equal(normalize(98.765), 98.77);
    assert.equal(normalize(103.456), 100);
  }
});

test("garde le contrôle de sortie du plein écran visible sans hover", async () => {
  const [reviewClient, productUi] = await Promise.all([
    source("../app/review/[token]/review-client.tsx"),
    source("../app/product-ui.css"),
  ]);

  assert.match(
    reviewClient,
    /className="review-fullscreen-toggle"[\s\S]{0,260}aria-pressed=\{isPreviewExpanded\}/,
  );
  assert.match(
    productUi,
    /\.review-flow\s+\.review-toolbar\s+\.review-fullscreen-toggle\[aria-pressed="true"\]\s*\{[\s\S]*?background:\s*var\(--rv-color-action\);[\s\S]*?color:\s*var\(--rv-color-on-action\);[\s\S]*?\}/,
  );
  assert.match(
    productUi,
    /\.review-flow\s+\.review-toolbar\s+\.review-fullscreen-toggle\s*\{[\s\S]*?min-height:\s*var\(--rv-control-height\);[\s\S]*?min-width:\s*var\(--rv-control-height\);[\s\S]*?\}/,
  );
  assert.match(
    productUi,
    /\.review-flow\s+\.review-toolbar\s+\.review-fullscreen-toggle:focus-visible\s*\{[\s\S]*?box-shadow:[\s\S]*?outline:[\s\S]*?\}/,
  );
});

test("désactive les actions développeur lorsque la release n’est plus active", async () => {
  const dashboard = await source("../app/dashboard/dashboard-client.tsx");
  const activeReleaseDefinition = between(
    dashboard,
    "const isActiveRelease",
    "const canInvite",
  );
  const feedbackHandler = between(
    dashboard,
    "async function advanceFeedback",
    "function releasePayload",
  );
  const previewHandler = between(
    dashboard,
    "async function signalPreviewUpdate",
    "async function sendDeveloperMessage",
  );
  const messageHandler = between(
    dashboard,
    "async function sendDeveloperMessage",
    "async function removeCurrentProject",
  );

  assert.match(activeReleaseDefinition, /!isReleaseExpired/);
  assert.match(
    activeReleaseDefinition,
    /\["in_review",\s*"changes_requested"\]\.includes\(review\.release\.status\)/,
  );
  assert.match(feedbackHandler, /!isActiveRelease\)\s*return/);
  assert.match(previewHandler, /!isActiveRelease\)\s*return/);
  assert.match(messageHandler, /!isActiveRelease\)\s*return/);

  assert.match(
    dashboard,
    /disabled=\{isUpdating \|\| !isActiveRelease\}[\s\S]{0,180}onClick=\{signalPreviewUpdate\}/,
  );
  assert.match(
    dashboard,
    /disabled=\{isUpdating \|\| !isActiveRelease\}[\s\S]{0,180}onClick=\{\(\) => advanceFeedback/,
  );
  assert.match(
    dashboard,
    /id="developer-message"[\s\S]{0,360}disabled=\{!isActiveRelease\}/,
  );
  assert.match(
    dashboard,
    /type="submit"[\s\S]{0,260}!isActiveRelease[\s\S]{0,120}!messageBody\.trim\(\)/,
  );
});

test("ne reprend un espace legacy qu’avec une identité Sites vérifiée", async () => {
  const [repository, registerRoute] = await Promise.all([
    source("../db/repository.ts"),
    source("../app/api/auth/register/route.ts"),
  ]);
  const registration = between(
    repository,
    "export async function registerDeveloperCredential",
    "export async function createDeveloperSession",
  );
  const guardStart = registration.indexOf("const credential = await db");
  const identityCreation = registration.indexOf("const identityDigest");
  const writes = registration.indexOf("const results = await db.batch");

  assert.ok(guardStart >= 0, "Garde legacy absente");
  assert.ok(
    guardStart < identityCreation && identityCreation < writes,
    "La garde legacy doit précéder toute création d’identité ou de tenant",
  );
  assert.match(
    registration,
    /SELECT[\s\S]*app_users\.id,[\s\S]*app_users\.email,[\s\S]*AS has_membership[\s\S]*WHERE app_users\.email = \?/,
  );

  const legacyGuard = registration.slice(guardStart, identityCreation);
  assert.match(legacyGuard, /SELECT COUNT\(\*\) AS count FROM developer_credentials/);
  assert.match(legacyGuard, /sitesAuthenticatedEmail === normalizedEmail/);
  assert.match(legacyGuard, /isLegacyLocalEmail\(legacyUsers\.results\[0\]\.email\)/);
  assert.match(legacyGuard, /legacyUsers\.results\.length === 1/);
  assert.match(legacyGuard, /LIMIT 2/);
  assert.match(legacyGuard, /throw new ReviewConflictError/);
  assert.match(
    registration,
    /SET email = \?, display_name = \?, last_seen_at = \?[\s\S]*WHERE id = \?[\s\S]*AND email = \?/,
  );
  assert.match(
    registration,
    /INSERT INTO developer_credentials[\s\S]*WHERE app_users\.id = \?[\s\S]*AND app_users\.email = \?[\s\S]*EXISTS \([\s\S]*FROM organization_members/,
  );
  assert.match(
    registerRoute,
    /passwordConfirmation:[\s\S]*body\.passwordConfirmation/,
  );
  assert.match(
    registerRoute,
    /sitesAuthenticatedEmailFromHeaders\(\s*request\.headers/,
  );
});

test("conserve et permet de consulter les retours de chaque version autorisée", async () => {
  const [repository, workspaceRoute, dashboard, dashboardPage, reviewClient] =
    await Promise.all([
      source("../db/repository.ts"),
      source("../app/api/workspace/route.ts"),
      source("../app/dashboard/dashboard-client.tsx"),
      source("../app/dashboard/page.tsx"),
      source("../app/review/[token]/review-client.tsx"),
    ]);
  const workspaceRepository = between(
    repository,
    "export async function getDeveloperWorkspace",
    "export type ReleaseInput",
  );
  const releaseHistoryQuery = between(
    workspaceRepository,
    "const releaseResult = await db",
    "const release = preferredReleaseId",
  );
  const payloadLoader = between(
    repository,
    "async function loadReviewPayload",
    "export async function getDeveloperWorkspace",
  );
  const releaseSubmission = between(
    dashboard,
    "async function submitRelease",
    "async function submitInvitation",
  );
  const releaseCreation = between(
    repository,
    "export async function createRelease(",
    "export async function createInvitation",
  );
  const invitationRevocation = between(
    releaseCreation,
    "`UPDATE review_invitations",
    ".bind(now, projectId)",
  );
  const sessionRevocation = between(
    releaseCreation,
    "`UPDATE reviewer_sessions",
    ".bind(now, projectId)",
  );

  assert.match(
    workspaceRepository,
    /preferredReleaseId\?: string \| null/,
  );
  assert.match(
    releaseHistoryQuery,
    /WHERE project_id = \?[\s\S]*ORDER BY created_at DESC, id DESC/,
  );
  assert.match(releaseHistoryQuery, /\.all<ReleaseRow>\(\)/);
  assert.doesNotMatch(releaseHistoryQuery, /\bLIMIT 1\b/);
  assert.match(
    workspaceRepository,
    /releaseResult\.results\.find\([\s\S]*candidate\.id === preferredReleaseId/,
  );
  assert.match(
    workspaceRepository,
    /preferredReleaseId && !release[\s\S]*throw new ReviewNotFoundError\("Version introuvable\."\)/,
  );
  assert.match(workspaceRepository, /\breleases,\s*\n\s*activeReview,/);

  assert.match(
    payloadLoader,
    /FROM review_feedback[\s\S]*\.bind\(input\.release\.id\)/,
  );
  assert.match(
    payloadLoader,
    /FROM release_messages[\s\S]*\.bind\(input\.release\.id\)/,
  );

  assert.match(
    workspaceRoute,
    /searchParams\.get\("release"\)/,
  );
  assert.match(
    workspaceRoute,
    /releaseId !== null && !resourceIdPattern\.test\(releaseId\)/,
  );
  assert.match(
    workspaceRoute,
    /getDeveloperWorkspace\(\s*identity,\s*projectId,\s*releaseId,/,
  );
  assert.match(workspaceRoute, /repositoryErrorResponse\(error\)/);

  assert.match(
    dashboard,
    /searchParams\.set\("release", requestedReleaseId\)/,
  );
  assert.match(
    dashboard,
    /async function selectRelease\(releaseId: string\)[\s\S]*refreshWorkspace\(releaseId\)/,
  );
  assert.match(
    dashboard,
    /id="release-selector"[\s\S]*value=\{review\.release\.id\}[\s\S]*workspace\.releases\.map/,
  );
  assert.match(
    releaseSubmission,
    /response\.json\(\)[\s\S]*releaseId: string[\s\S]*refreshWorkspace\(result\.releaseId\)/,
  );

  assert.match(invitationRevocation, /WHERE project_id = \?/);
  assert.match(sessionRevocation, /WHERE project_id = \?/);
  assert.doesNotMatch(
    `${invitationRevocation}\n${sessionRevocation}`,
    /status IN \('in_review', 'changes_requested'\)/,
  );

  assert.match(dashboard, /workspaceRequestSequenceRef = useRef\(0\)/);
  assert.match(
    dashboard,
    /requestSequence !== workspaceRequestSequenceRef\.current[\s\S]*return null/,
  );
  assert.match(
    dashboard,
    /current\.activeReview\?\.release\.id === targetReleaseId[\s\S]*updated\.releaseId === targetReleaseId/,
  );
  assert.match(
    dashboard,
    /current\.activeReview\?\.release\.id !== targetReleaseId[\s\S]*message\.releaseId !== targetReleaseId/,
  );
  assert.match(dashboard, /window\.history\.pushState\(null, "", nextUrl\)/);
  assert.match(dashboard, /addEventListener\("popstate"/);

  assert.match(
    dashboardPage,
    /searchParams: Promise<\{ project\?: string; release\?: string \}>/,
  );
  assert.match(
    dashboardPage,
    /getDeveloperWorkspace\([\s\S]*project,\s*release,/,
  );

  assert.match(reviewClient, /reviewMutationVersionRef = useRef\(0\)/);
  assert.match(reviewClient, /activeReviewMutationsRef = useRef\(0\)/);
  assert.match(
    reviewClient,
    /const mutationVersion = reviewMutationVersionRef\.current[\s\S]*mutationVersion === reviewMutationVersionRef\.current[\s\S]*activeReviewMutationsRef\.current === 0/,
  );
  assert.match(
    reviewClient,
    /async function submitFeedback[\s\S]*beginReviewMutation\(\)[\s\S]*finishReviewMutation\(\)/,
  );
});
