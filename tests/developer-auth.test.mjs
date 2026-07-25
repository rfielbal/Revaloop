import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPER_PASSWORD_ITERATIONS,
  DeveloperAuthError,
  hashDeveloperPassword,
  normalizeDeveloperEmail,
  safeAuthReturnPath,
  serializeDeveloperSessionCookie,
  validateDeveloperPassword,
  verifyDeveloperPassword,
} from "../lib/developer-auth-core.ts";

test("dérive un mot de passe avec un sel unique et vérifie sans le conserver", async () => {
  const password = "une phrase de passe réellement longue";
  const first = await hashDeveloperPassword(password);
  const second = await hashDeveloperPassword(password);

  assert.equal(first.passwordIterations, DEVELOPER_PASSWORD_ITERATIONS);
  assert.notEqual(first.passwordSalt, second.passwordSalt);
  assert.notEqual(first.passwordHash, second.passwordHash);
  assert.equal(await verifyDeveloperPassword(password, first), true);
  assert.equal(await verifyDeveloperPassword("mot de passe incorrect", first), false);
  assert.doesNotMatch(first.passwordHash, /phrase|passe|longue/i);
});

test("borne les mots de passe et normalise les adresses développeur", () => {
  assert.equal(
    normalizeDeveloperEmail("  Studio@Example.COM "),
    "studio@example.com",
  );
  assert.equal(normalizeDeveloperEmail("adresse-invalide"), "");
  assert.throws(
    () => validateDeveloperPassword("trop court"),
    DeveloperAuthError,
  );
  assert.throws(
    () => validateDeveloperPassword("a".repeat(129)),
    DeveloperAuthError,
  );
  assert.equal(
    validateDeveloperPassword("douze-caracteres"),
    "douze-caracteres",
  );
});

test("refuse les redirections externes et les boucles d’authentification", () => {
  assert.equal(
    safeAuthReturnPath("/dashboard?project=project_1"),
    "/dashboard?project=project_1",
  );
  assert.equal(safeAuthReturnPath("//evil.example"), "/dashboard");
  assert.equal(safeAuthReturnPath("https://evil.example"), "/dashboard");
  assert.equal(safeAuthReturnPath("/api/auth/logout"), "/dashboard");
  assert.equal(safeAuthReturnPath("/login"), "/dashboard");
});

test("durcit le cookie de session développeur", () => {
  const cookie = serializeDeveloperSessionCookie({
    token: "jeton-opaque",
    expiresAt: "2030-01-01T00:00:00.000Z",
    secure: true,
  });

  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=2592000/);
  assert.doesNotMatch(cookie, /Domain=/);
});
