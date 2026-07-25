import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RequestValidationError,
  assertSameOrigin,
  generateSecret,
  normalizeExternalPreviewUrl,
  normalizeReviewPath,
  parseCookies,
  readJsonObject,
  serializeReviewCookie,
  sha256,
} from "../lib/security.ts";

test("génère des secrets imprévisibles et ne conserve que leur empreinte", async () => {
  const first = generateSecret();
  const second = generateSecret();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(await sha256(first), /^[a-f0-9]{64}$/);
  assert.notEqual(await sha256(first), first);
});

test("retire les query strings et fragments du chemin de contexte", () => {
  assert.equal(normalizeReviewPath("/commande?token=secret#paiement"), "/commande");
  assert.equal(normalizeReviewPath("/catalogue/été"), "/catalogue/%C3%A9t%C3%A9");
  assert.equal(normalizeReviewPath("https://evil.example/path?token=x"), "/");
  assert.equal(normalizeReviewPath("//evil.example/path"), "/");
});

test("refuse les previews non HTTPS, locales, authentifiées ou à paramètres", () => {
  assert.equal(
    normalizeExternalPreviewUrl("https://staging.example.test/demo#secret"),
    "https://staging.example.test/demo",
  );
  assert.throws(
    () => normalizeExternalPreviewUrl("http://staging.example.test"),
    RequestValidationError,
  );
  assert.throws(
    () => normalizeExternalPreviewUrl("https://user:pass@example.test"),
    RequestValidationError,
  );
  assert.throws(
    () => normalizeExternalPreviewUrl("https://example.test/?token=secret"),
    RequestValidationError,
  );
  assert.throws(
    () => normalizeExternalPreviewUrl("https://127.0.0.1:8787"),
    RequestValidationError,
  );
  assert.equal(
    normalizeExternalPreviewUrl("http://localhost:3000", true),
    "http://localhost:3000/",
  );
});

test("borne et valide strictement les corps JSON", async () => {
  const valid = new Request("https://revaloop.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Retour" }),
  });
  assert.deepEqual(await readJsonObject(valid), { title: "Retour" });

  await assert.rejects(
    readJsonObject(
      new Request("https://revaloop.test/api", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      }),
    ),
    (error) =>
      error instanceof RequestValidationError && error.status === 415,
  );

  await assert.rejects(
    readJsonObject(
      new Request("https://revaloop.test/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "[]",
      }),
    ),
    RequestValidationError,
  );
});

test("refuse les mutations sans origine exacte", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin(
      new Request("https://revaloop.test/api", {
        headers: { Origin: "https://revaloop.test" },
      }),
    ),
  );
  assert.throws(
    () =>
      assertSameOrigin(
        new Request("https://revaloop.test/api", {
          headers: { Origin: "https://evil.example" },
        }),
      ),
    RequestValidationError,
  );
  assert.throws(
    () => assertSameOrigin(new Request("https://revaloop.test/api")),
    RequestValidationError,
  );
});

test("durcit le cookie reviewer et analyse les cookies sans exception", () => {
  const cookie = serializeReviewCookie({
    releaseId: "release_demo",
    token: "opaque-token",
    expiresAt: "2030-01-01T00:00:00.000Z",
    secure: true,
  });

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);

  const cookies = parseCookies(
    new Request("https://revaloop.test", {
      headers: { Cookie: "first=hello%20world; malformed; second=%E0%A4%A" },
    }),
  );
  assert.equal(cookies.get("first"), "hello world");
  assert.equal(cookies.get("second"), "%E0%A4%A");
});

test("protège les nouveaux endpoints de collaboration contre les mutations croisées", async () => {
  const [developerMessages, reviewerMutations, previewUpdates, login, register] =
    await Promise.all([
      readFile(
        new URL(
          "../app/api/releases/[id]/messages/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/review/[token]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/releases/[id]/preview/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/login/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/auth/register/route.ts", import.meta.url),
        "utf8",
      ),
    ]);

  for (const source of [
    developerMessages,
    reviewerMutations,
    previewUpdates,
    login,
    register,
  ]) {
    assert.match(source, /assertSameOrigin\(request\)/);
  }

  assert.match(developerMessages, /developerIdentityFromRequest\(request\)/);
  assert.match(developerMessages, /namespace:\s*"developer-message"/);
  assert.match(previewUpdates, /developerIdentityFromRequest\(request\)/);
  assert.match(previewUpdates, /namespace:\s*"developer-preview-update"/);
  assert.match(reviewerMutations, /sessionToken\(request,\s*releaseId\)/);
  assert.match(reviewerMutations, /namespace:\s*"review-write"/);
  assert.match(login, /namespace:\s*"developer-login-ip"/);
  assert.match(login, /namespace:\s*"developer-login-account"/);
  assert.match(register, /namespace:\s*"developer-register-ip"/);
});
