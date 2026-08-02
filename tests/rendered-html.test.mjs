import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

const cloudflareWorkersModule = `data:text/javascript,${encodeURIComponent(`
class TestD1Statement {
  constructor(sql) {
    this.sql = sql;
  }

  bind() {
    return this;
  }

  async run() {
    return { meta: { changes: 0 } };
  }

  async all() {
    if (/PRAGMA table_info\\(review_releases\\)/i.test(this.sql)) {
      return { results: [{ name: "preview_revision" }] };
    }

    return { results: [] };
  }

  async first() {
    if (/SELECT COUNT\\(\\*\\) AS count FROM developer_credentials/i.test(this.sql)) {
      return { count: 0 };
    }
    if (/INSERT INTO rate_limit_buckets/i.test(this.sql)) {
      return { count: 1 };
    }

    return null;
  }
}

class TestD1Database {
  prepare(sql) {
    return new TestD1Statement(sql);
  }

  async batch(statements) {
    return statements.map(() => ({ meta: { changes: 0 } }));
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

async function render(
  pathname,
  headers = {},
  origin = "https://revaloop.test",
) {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request(`${origin}${pathname}`, {
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

function assertNoDemoIdentity(html) {
  assert.doesNotMatch(
    visibleText(html),
    /\b(?:Claire|Rapha(?:e|ë)l|ChatGPT)\b/iu,
  );
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
  assert.match(text, /Repères facultatifs/);
  assert.match(text, /Environnement de test/);
  assert.match(text, /Ajouter un retour/);
  assertNoDemoIdentity(html);
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
  assert.match(text, /session valable 24 heures maximum sur cet appareil/);
  assertInternalLink(html, "/privacy");
  assert.doesNotMatch(html, /token=/);
});

test("rend le relais de preview sans accepter l’URL dans la requête", async () => {
  const { response, html } = await render("/connect-preview");
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Relier une preview · Revaloop");
  assertNamedMeta(html, "robots", "noindex, nofollow, noarchive, nosnippet");
  assertAccessibleStructure(html);
  assert.match(text, /Connexion de la preview/);
  assert.doesNotMatch(html, /trycloudflare\.com/);
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
  assert.match(text, /La preview est un service séparé/);
  assert.match(text, /e-mail reste visible uniquement par l’équipe autorisée/);
  assert.match(text, /Cloudflare termine la connexion TLS/);
});

test("autorise uniquement le bridge public à être chargé en cross-origin", async () => {
  const { response } = await render("/revaloop-bridge.js");

  assert.equal(
    response.headers.get("cross-origin-resource-policy"),
    "cross-origin",
  );
});

test("protège le dashboard par la connexion Revaloop en production", async () => {
  const { response } = await render("/dashboard");

  assert.ok([303, 307, 308].includes(response.status));
  assert.match(
    response.headers.get("location") ?? "",
    /^(?:https:\/\/revaloop\.test)?\/login\?return_to=%2Fdashboard$/,
  );
  assertSecurityHeaders(response);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
});

test("conserve la reprise de preview à travers la connexion", async () => {
  const { response } = await render("/dashboard?connect_preview=1");

  assert.ok([303, 307, 308].includes(response.status));
  assert.match(
    response.headers.get("location") ?? "",
    /return_to=%2Fdashboard%3Fconnect_preview%3D1$/,
  );
});

test("rend la connexion propriétaire sans dépendre d’un compte tiers", async () => {
  const { response, html } = await render(
    "/login?return_to=%2Fdashboard",
  );
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Connexion · Revaloop");
  assertNamedMeta(html, "robots", "noindex, nofollow");
  assertAccessibleStructure(html);
  assert.match(text, /Espace développeur protégé/);
  assert.match(text, /Saisissez vos identifiants Revaloop/);
  assert.match(html, /name=["']email["']/i);
  assert.match(html, /name=["']password["']/i);
  assert.match(text, /bootstrap public est verrouillé/);
  assert.doesNotMatch(html, /href=["']\/register\?return_to=/i);
  assertNoDemoIdentity(html);
});

test("rend l’initialisation sécurisée du premier compte", async () => {
  const { response, html } = await render(
    "/register?return_to=%2Fdashboard",
    {
      "oai-authenticated-user-email": "owner@example.test",
      host: "revaloop-rfielbal.moulbyte.chatgpt.site",
    },
    "https://revaloop-rfielbal.moulbyte.chatgpt.site",
  );
  const text = visibleText(html);

  assertHtmlResponse(response);
  assertSecurityHeaders(response);
  assertTitle(html, "Initialiser l’instance · Revaloop");
  assertNamedMeta(html, "robots", "noindex, nofollow");
  assertAccessibleStructure(html);
  assert.match(text, /Créez le premier compte/);
  assert.match(text, /inscriptions suivantes seront fermées automatiquement/);
  assert.match(html, /name=["']displayName["']/i);
  assert.match(html, /name=["']email["']/i);
  assert.match(
    html,
    /<input\b(?=[^>]*\bname=["']password["'])(?=[^>]*\bminlength=["']12["'])[^>]*>/i,
  );
  assert.match(
    html,
    /<input\b(?=[^>]*\bname=["']passwordConfirmation["'])(?=[^>]*\bminlength=["']12["'])[^>]*>/i,
  );
  assert.match(html, /aria-label=["']Afficher les deux mots de passe["']/i);
  assertInternalLink(html, "/login?return_to=%2Fdashboard");
  assertNoDemoIdentity(html);
});

test("préremplit sans ambiguïté l’adresse authentifiée par Sites", async () => {
  const { response, html } = await render(
    "/register?return_to=%2Fdashboard",
    {
      "oai-authenticated-user-email": "  Owner@Example.TEST ",
      host: "revaloop-rfielbal.moulbyte.chatgpt.site",
    },
    "https://revaloop-rfielbal.moulbyte.chatgpt.site",
  );
  const text = visibleText(html);

  assertHtmlResponse(response);
  assert.match(
    html,
    /<input\b(?=[^>]*\bname=["']email["'])(?=[^>]*\bvalue=["']owner@example\.test["'])(?=[^>]*\breadonly(?:=["'][^"']*["'])?)[^>]*>/i,
  );
  assert.match(text, /adresse a été confirmée par l’accès privé Sites/i);
});

test("n’annonce pas une identité Sites sur la seule foi du proxy", async () => {
  const { response, html } = await render(
    "/register?return_to=%2Fdashboard",
    {
      host: "revaloop.test",
      "x-forwarded-host": "revaloop-rfielbal.moulbyte.chatgpt.site",
      "oai-authenticated-user-email": "owner@example.test",
    },
  );
  const text = visibleText(html);

  assertHtmlResponse(response);
  assert.doesNotMatch(
    html,
    /<input\b(?=[^>]*\bname=["']email["'])(?=[^>]*\breadonly)[^>]*>/i,
  );
  assert.doesNotMatch(text, /adresse a été confirmée par l’accès privé Sites/i);
});

test("refuse une confirmation de mot de passe différente dans l’API", async () => {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request(
      "https://revaloop-rfielbal.moulbyte.chatgpt.site/api/auth/register",
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://revaloop-rfielbal.moulbyte.chatgpt.site",
        Host: "revaloop-rfielbal.moulbyte.chatgpt.site",
        "oai-authenticated-user-email": "owner@example.test",
      },
      body: JSON.stringify({
        displayName: "Studio",
        email: "owner@example.test",
        password: "une phrase de passe",
        passwordConfirmation: "une autre phrase",
      }),
      },
    ),
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
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(payload.error, /ne correspondent pas/);
});

test("refuse le bootstrap anonyme sur une instance publique neuve", async () => {
  const worker = await getWorker();
  const response = await worker.fetch(
    new Request("https://revaloop.test/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://revaloop.test",
      },
      body: JSON.stringify({
        displayName: "Studio",
        email: "owner@example.test",
        password: "une phrase de passe",
        passwordConfirmation: "une phrase de passe",
      }),
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
  const payload = await response.json();

  assert.equal(response.status, 403);
  assert.match(payload.error, /initialisation publique est verrouillée/i);
});

test("versionne les vingt tables D1 et les migrations de sécurité", async () => {
  const [
    schema,
    legacy,
    secure,
    privacy,
    collaboration,
    feedbackAuthors,
    hosting,
  ] = await Promise.all([
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
    readFile(
      new URL("../drizzle/0003_sparkling_wrecker.sql", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../drizzle/0004_new_ben_parker.sql", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  const schemaTables = [
    ...schema.matchAll(/sqliteTable\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
  const migratedTables = [legacy, secure, collaboration]
    .flatMap((sql) => [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)])
    .map((match) => match[1]);

  assert.equal(schemaTables.length, 20);
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
  assert.match(collaboration, /CREATE TABLE `developer_credentials`/);
  assert.match(collaboration, /CREATE TABLE `developer_sessions`/);
  assert.match(collaboration, /CREATE TABLE `release_messages`/);
  assert.match(
    collaboration,
    /ALTER TABLE `review_releases` ADD `preview_revision` integer DEFAULT 0 NOT NULL/,
  );
  assert.match(
    collaboration,
    /CREATE UNIQUE INDEX `developer_sessions_token_hash_unique`/,
  );
  assert.match(
    collaboration,
    /FOREIGN KEY \(`author_session_id`\) REFERENCES `reviewer_sessions`\(`id`\).*ON DELETE set null/,
  );
  assert.match(
    feedbackAuthors,
    /ADD `author_type` text DEFAULT 'reviewer' NOT NULL/,
  );

  const hostingConfig = JSON.parse(hosting);
  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
});

test("garde les messages, la preview et les vérifications optionnelles câblés", async () => {
  const [
    developerMessages,
    reviewerMutations,
    previewUpdates,
    releaseCreation,
    dashboard,
  ] = await Promise.all([
    readFile(
      new URL("../app/api/releases/[id]/messages/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/review/[token]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/releases/[id]/preview/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/projects/[id]/releases/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/dashboard/dashboard-client.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(developerMessages, /createReleaseMessageAsDeveloper/);
  assert.match(developerMessages, /assertSameOrigin\(request\)/);
  assert.match(developerMessages, /namespace:\s*"developer-message"/);
  assert.match(reviewerMutations, /body\.kind === "message"/);
  assert.match(reviewerMutations, /createReleaseMessageAsReviewer/);
  assert.match(previewUpdates, /incrementPreviewRevision/);
  assert.match(previewUpdates, /assertSameOrigin\(request\)/);
  assert.match(previewUpdates, /namespace:\s*"developer-preview-update"/);

  assert.match(releaseCreation, /Array\.isArray\(body\.testItems\)/);
  assert.match(releaseCreation, /:\s*\[\];/);
  assert.doesNotMatch(
    releaseCreation,
    /Vérifier le parcours principal|testItems\.length\s*\?\s*testItems/,
  );
  assert.match(dashboard, /Vérifications suggérées · optionnel/);
  assert.doesNotMatch(dashboard, /defaultValue=["']Vérifier le parcours principal/);
});
