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

test("refuse de créer un nouveau tenant à côté d’un espace legacy", async () => {
  const repository = await source("../db/repository.ts");
  const registration = between(
    repository,
    "export async function registerDeveloperCredential",
    "export async function createDeveloperSession",
  );
  const guardStart = registration.indexOf(
    "if (!input.allowAdditional && !existingUser)",
  );
  const identityCreation = registration.indexOf("const identityDigest");
  const writes = registration.indexOf("const results = await db.batch");

  assert.ok(guardStart >= 0, "Garde legacy absente");
  assert.ok(
    guardStart < identityCreation && identityCreation < writes,
    "La garde legacy doit précéder toute création d’identité ou de tenant",
  );
  assert.match(
    registration,
    /SELECT id FROM app_users WHERE email = \? LIMIT 1/,
  );

  const legacyGuard = registration.slice(guardStart, identityCreation);
  assert.match(
    legacyGuard,
    /FROM app_users[\s\S]*FROM organization_members[\s\S]*organization_members\.user_id = app_users\.id/,
  );
  assert.match(legacyGuard, /\(legacyUsers\?\.count \?\? 0\) > 0/);
  assert.match(legacyGuard, /throw new ReviewConflictError/);
  assert.match(
    legacyGuard,
    /Utilisez l’adresse e-mail du compte développeur historique/,
  );

  assert.match(
    registration,
    /INSERT INTO developer_credentials[\s\S]*WHERE app_users\.id = \?[\s\S]*AND app_users\.email = \?[\s\S]*EXISTS \([\s\S]*FROM organization_members/,
  );
});
