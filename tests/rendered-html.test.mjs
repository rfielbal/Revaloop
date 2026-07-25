import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

const cloudflareWorkersModule =
  "data:text/javascript,export%20const%20env%20%3D%20%7B%7D%3B";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        shortCircuit: true,
        url: cloudflareWorkersModule,
      };
    }

    return nextResolve(specifier, context);
  },
});

const forbiddenStarterContent =
  /codex-preview|vinext-starter|starter project|your site is taking shape/i;

let workerPromise;

function getWorker() {
  workerPromise ??= import(
    new URL(
      `../dist/server/index.js?test=${process.pid}-${Date.now()}`,
      import.meta.url,
    ).href
  ).then((module) => module.default);

  return workerPromise;
}

async function render(pathname, headers = {}) {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request(`https://revaloop.test${pathname}`, {
      headers: {
        accept: "text/html",
        ...headers,
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  return {
    response,
    html: await response.text(),
  };
}

function assertHtmlResponse(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
}

function assertTitle(html, expected) {
  assert.equal(html.match(/<title>([^<]*)<\/title>/i)?.[1], expected);
}

function assertNamedMeta(html, name, expectedContent) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) =>
    new RegExp(`\\bname=["']${name}["']`, "i").test(candidate),
  );

  assert.ok(tag, `Balise meta "${name}" absente`);
  assert.match(
    tag,
    new RegExp(
      `\\bcontent=["']${expectedContent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i",
    ),
  );
}

function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function assertAccessibleStructure(html) {
  assert.match(html, /<html\b[^>]*\blang=["']fr["']/i);
  assert.equal((html.match(/<main\b/gi) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/gi) ?? []).length, 1);
}

function assertInternalLink(html, href) {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(`<a\\b[^>]*href=["']${escaped}["']`, "i"));
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );

  const policy = response.headers.get("content-security-policy") ?? "";
  assert.match(policy, /\bdefault-src 'self'/);
  assert.match(policy, /\bframe-ancestors 'none'/);
  assert.match(policy, /\bframe-src https:/);
  assert.doesNotMatch(policy, /\bwss:/);
}

test("rend la landing et sépare clairement démo et espace développeur", async () => {
  const { response, html } = await render("/");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Revaloop — Du lien de test à la validation");
  assertAccessibleStructure(html);
  assert.match(text, /Le lien ouvre le projet\. Revaloop garde le fil\./);
  assert.match(text, /Alpha open source · pilote fonctionnel/);
  assert.match(text, /Invitations éphémères à usage unique/);
  assertInternalLink(html, "/dashboard");
  assertInternalLink(html, "/demo");
  assert.doesNotMatch(html, /href=["']\/review\/maison-matisse-v12["']/);
  assert.doesNotMatch(html, forbiddenStarterContent);
});

test("rend une démonstration cliente publique mais non indexable", async () => {
  const { response, html } = await render("/demo");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Démonstration client · Revaloop");
  assertNamedMeta(html, "robots", "noindex, nofollow, noarchive, nosnippet");
  assertAccessibleStructure(html);
  assert.match(text, /Maison Matisse/);
  assert.match(text, /Parcours suggéré/);
  assert.match(text, /Environnement de test/);
  assert.match(text, /Ajouter un retour/);
  assert.doesNotMatch(html, forbiddenStarterContent);
});

test("ne divulgue aucun projet sans cookie de session", async () => {
  const { response, html } = await render("/review/release-inconnue");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertNamedMeta(html, "robots", "noindex, nofollow, noarchive, nosnippet");
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
  assertAccessibleStructure(html);
  assert.match(text, /Cette session n’est pas reconnue/);
  assert.match(text, /ne révèle aucune information sur le projet/);
  assert.doesNotMatch(text, /Maison Matisse/);
});

test("rend la page d’échange sans exposer le secret côté serveur", async () => {
  const { response, html } = await render("/join");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Ouvrir une invitation · Revaloop");
  assertNamedMeta(html, "robots", "noindex, nofollow, noarchive, nosnippet");
  assertAccessibleStructure(html);
  assert.match(text, /Votre espace de test est prêt/);
  assert.match(text, /Le secret est retiré de l’adresse/);
  assertInternalLink(html, "/privacy");
  assert.doesNotMatch(html, /token=/);
});

test("rend la notice de confidentialité de l’instance", async () => {
  const { response, html } = await render("/privacy");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Confidentialité · Revaloop");
  assertAccessibleStructure(html);
  assert.match(text, /Ce que Revaloop conserve pendant un test/);
  assert.match(text, /responsable des données/);
  assert.match(text, /La preview de staging est un service séparé/);
});

test("autorise uniquement le bridge public à être chargé en cross-origin", async () => {
  const { response } = await render("/revaloop-bridge.js");

  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "cross-origin",
  );
});

test("protège le dashboard par Sign in with ChatGPT en production", async () => {
  const { response } = await render("/dashboard");

  assert.ok([303, 307, 308].includes(response.status));
  assert.match(
    response.headers.get("location") ?? "",
    /^(?:https:\/\/revaloop\.test)?\/signin-with-chatgpt\?return_to=%2Fdashboard$/,
  );
  assertSecurityHeaders(response);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
});

test("versionne toutes les tables D1 et la migration de confidentialité", async () => {
  const [schema, legacy, secure, privacy, hosting] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0000_redundant_vance_astro.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/0001_sleepy_paper_doll.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/0002_sticky_mystique.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  const schemaTables = [
    ...schema.matchAll(/sqliteTable\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
  const migratedTables = [legacy, secure]
    .flatMap((sql) => [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)])
    .map((match) => match[1]);

  assert.equal(schemaTables.length, 17);
  assert.deepEqual(
    [...new Set(migratedTables)].sort(),
    [...schemaTables].sort(),
  );
  assert.match(
    secure,
    /CREATE UNIQUE INDEX `review_feedback_release_sequence_unique`/,
  );
  assert.match(
    secure,
    /CREATE UNIQUE INDEX `review_decisions_release_unique`/,
  );
  assert.match(
    privacy,
    /reviewer_session_id` text,/,
  );
  assert.match(privacy, /ON DELETE set null/);
  assert.match(privacy, /PRAGMA defer_foreign_keys=ON/);
  assert.doesNotMatch(privacy, /PRAGMA foreign_keys=OFF/);

  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
});
