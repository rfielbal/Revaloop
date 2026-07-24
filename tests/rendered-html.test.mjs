import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

const cloudflareWorkersModule =
  "data:text/javascript,export%20const%20env%20%3D%20%7B%7D%3B";

// The production bundle targets workerd and keeps this native module external.
// Page smoke tests do not query D1, so a minimal module lets Node execute the
// built Worker while preserving the same request/response entrypoint.
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
  /codex-preview|react-loading-skeleton|vinext-starter|starter project|your site is taking shape|building your site/i;

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

async function render(pathname) {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request(`https://revaloop.test${pathname}`, {
      headers: {
        accept: "text/html",
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

  assert.ok(tag, `Expected a "${name}" meta tag`);
  assert.match(
    tag,
    new RegExp(
      `\\bcontent=["']${expectedContent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      "i",
    ),
  );
}

function assertNoStarterContent(html) {
  assert.doesNotMatch(html, forbiddenStarterContent);
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

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );

  const contentSecurityPolicy =
    response.headers.get("content-security-policy") ?? "";
  assert.match(contentSecurityPolicy, /\bdefault-src 'self'/);
  assert.match(contentSecurityPolicy, /\bbase-uri 'self'/);
  assert.match(contentSecurityPolicy, /\bframe-ancestors 'none'/);
  assert.match(contentSecurityPolicy, /\bform-action 'self'/);
}

test("server-renders the Revaloop landing page", async () => {
  const { response, html } = await render("/");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Revaloop — Du lien de test à la validation");
  assertNamedMeta(
    html,
    "description",
    "La plateforme open source de recette client : partagez une version dédiée, recueillez des retours contextualisés et faites-la valider.",
  );
  assert.doesNotMatch(
    html,
    /<meta(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*noindex)/i,
  );
  assert.match(text, /Votre client ne veut pas/);
  assert.match(text, /Revaloop rassemble tout cela dans un lien de revue dédié\./);
  assert.match(text, /Du lien de test à une validation exploitable\./);
  assert.match(
    text,
    /Un outil que les développeurs peuvent vraiment inspecter\./,
  );
  assertNoStarterContent(html);
});

test("server-renders the developer dashboard", async () => {
  const { response, html } = await render("/dashboard");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Espace développeur · Revaloop");
  assertNamedMeta(
    html,
    "description",
    "Suivez une version en recette, traitez les retours et préparez sa validation.",
  );
  assert.match(text, /Maison Matisse/);
  assert.match(text, /Version v1\.2 en recette/);
  assert.match(text, /Boucle de validation/);
  assert.match(text, /Retours de cette version/);
  assert.match(text, /Données de démonstration chargées localement\./);
  assertNoStarterContent(html);
});

test("server-renders the private review with noindex metadata", async () => {
  const { response, html } = await render(
    "/review/maison-matisse-v12",
  );
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Espace de test privé · Revaloop");
  assertNamedMeta(
    html,
    "description",
    "Consultez une version de test qui vous a été partagée.",
  );
  assertNamedMeta(html, "robots", "noindex, nofollow, noarchive, nosnippet");
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive, nosnippet",
  );
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  assert.match(text, /Maison Matisse/);
  assert.match(text, /Version v1\.2/);
  assert.match(text, /Terminer le test/);
  assert.match(
    text,
    /Vous testez une démonstration avec des données fictives\./,
  );
  assert.match(text, /3 points à vérifier/);
  assert.match(
    text,
    /Environnement de test : utilisez uniquement des informations fictives\./,
  );
  assert.match(text, /\bParcourir\b/);
  assert.match(text, /\bAnnoter\b/);
  assertNoStarterContent(html);
});

test("does not disclose the demo project for an invalid review token", async () => {
  const { response, html } = await render("/review/lien-invalide");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertNamedMeta(html, "robots", "noindex, nofollow, noarchive, nosnippet");
  assert.match(text, /Ce lien n’est pas valide/);
  assert.match(text, /Revaloop ne révèle aucune information sur le projet/);
  assert.doesNotMatch(text, /Maison Matisse/);
  assertNoStarterContent(html);
});

test("keeps the Drizzle schema and initial migration aligned", async () => {
  const [schema, migration, hosting] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../drizzle/0000_redundant_vance_astro.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  const schemaTables = [
    ...schema.matchAll(/sqliteTable\(\s*["']([^"']+)["']/g),
  ]
    .map((match) => match[1])
    .sort();
  const migrationTables = [
    ...migration.matchAll(/CREATE TABLE `([^`]+)`/g),
  ]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(schemaTables, [
    "decisions",
    "feedback_items",
    "projects",
    "releases",
  ]);
  assert.deepEqual(migrationTables, schemaTables);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX `releases_share_token_unique` ON `releases` \(`share_token`\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(`release_id`\) REFERENCES `releases`\(`id`\)[^;]+ON DELETE cascade/g,
  );
  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
});
