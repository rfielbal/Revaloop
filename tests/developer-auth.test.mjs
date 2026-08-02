import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRequestHostname,
  DEVELOPER_PASSWORD_ITERATIONS,
  developerBootstrapRequestIsAuthorized,
  developerRegistrationPolicyAllowsRequest,
  DeveloperAuthError,
  hashDeveloperPassword,
  isLoopbackRequestHostname,
  normalizeDeveloperEmail,
  safeAuthReturnPath,
  serializeDeveloperSessionCookie,
  sitesAuthenticatedEmailFromHeaders,
  validateDeveloperPassword,
  validateDeveloperPasswordConfirmation,
  verifyDeveloperPassword,
} from "../lib/developer-auth-core.ts";

test("dérive un mot de passe avec un sel unique et vérifie sans le conserver", async () => {
  const password = "une phrase de passe réellement longue";
  const first = await hashDeveloperPassword(password);
  const second = await hashDeveloperPassword(password);

  assert.equal(DEVELOPER_PASSWORD_ITERATIONS, 100_000);
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
  assert.equal(
    validateDeveloperPasswordConfirmation(
      "une phrase de passe",
      "une phrase de passe",
    ),
    "une phrase de passe",
  );
  assert.throws(
    () =>
      validateDeveloperPasswordConfirmation(
        "une phrase de passe",
        "une autre phrase",
      ),
    (error) =>
      error instanceof DeveloperAuthError &&
      /ne correspondent pas/.test(error.message),
  );
});

test("ne fait confiance à l’identité Sites que sur l’origine Revaloop connue", () => {
  const headers = new Headers({
    host: "revaloop-rfielbal.moulbyte.chatgpt.site",
    "oai-authenticated-user-email": " Owner@Example.TEST ",
  });

  assert.equal(
    canonicalRequestHostname(headers),
    "revaloop-rfielbal.moulbyte.chatgpt.site",
  );
  assert.equal(
    sitesAuthenticatedEmailFromHeaders(headers),
    "owner@example.test",
  );
  assert.equal(
    sitesAuthenticatedEmailFromHeaders(
      new Headers({
        host: "localhost:3000",
        "oai-authenticated-user-email": "Owner@Example.TEST",
      }),
    ),
    null,
  );
  assert.equal(
    sitesAuthenticatedEmailFromHeaders(
      new Headers({
        host: "revaloop.example.test",
        "oai-authenticated-user-email": "Owner@Example.TEST",
      }),
    ),
    null,
  );

  const previousTrustedHostname =
    process.env.REVALOOP_TRUSTED_SITES_HOSTNAME;
  process.env.REVALOOP_TRUSTED_SITES_HOSTNAME = "private.example.test";
  try {
    assert.equal(
      sitesAuthenticatedEmailFromHeaders(
        new Headers({
          host: "private.example.test",
          "oai-authenticated-user-email": "Owner@Example.TEST",
        }),
      ),
      "owner@example.test",
    );
    assert.equal(
      sitesAuthenticatedEmailFromHeaders(
        new Headers({
          host: "sub.private.example.test",
          "oai-authenticated-user-email": "Owner@Example.TEST",
        }),
      ),
      null,
    );
  } finally {
    if (previousTrustedHostname === undefined) {
      delete process.env.REVALOOP_TRUSTED_SITES_HOSTNAME;
    } else {
      process.env.REVALOOP_TRUSTED_SITES_HOSTNAME =
        previousTrustedHostname;
    }
  }
});

test("ignore le hostname transféré et utilise le même Host canonique partout", () => {
  const proxiedHeaders = new Headers({
    host: "revaloop.example.test:8443",
    "x-forwarded-host": "revaloop-rfielbal.moulbyte.chatgpt.site",
    "oai-authenticated-user-email": "owner@example.test",
  });

  assert.equal(
    canonicalRequestHostname(proxiedHeaders),
    "revaloop.example.test",
  );
  assert.equal(sitesAuthenticatedEmailFromHeaders(proxiedHeaders), null);
  assert.equal(
    canonicalRequestHostname(
      new Headers({ host: "user@revaloop-rfielbal.moulbyte.chatgpt.site" }),
    ),
    "",
  );
  assert.equal(
    canonicalRequestHostname(
      new Headers({
        host: "revaloop.example.test, revaloop-rfielbal.moulbyte.chatgpt.site",
      }),
    ),
    "",
  );
  assert.equal(
    isLoopbackRequestHostname(
      canonicalRequestHostname(new Headers({ host: "[::1]:3000" })),
    ),
    true,
  );
});

test("verrouille le bootstrap public anonyme par défaut", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOperatorMode =
    process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP;
  process.env.NODE_ENV = "production";
  delete process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP;

  try {
    assert.equal(
      developerBootstrapRequestIsAuthorized(
        new Headers({ host: "revaloop-rfielbal.moulbyte.chatgpt.site" }),
      ),
      false,
    );
    assert.equal(
      developerBootstrapRequestIsAuthorized(
        new Headers({
          host: "revaloop-rfielbal.moulbyte.chatgpt.site",
          "oai-authenticated-user-email": "owner@example.test",
        }),
      ),
      true,
    );
    assert.equal(
      developerBootstrapRequestIsAuthorized(
        new Headers({
          host: "public.example.test",
          "x-forwarded-host":
            "revaloop-rfielbal.moulbyte.chatgpt.site",
          "oai-authenticated-user-email": "owner@example.test",
        }),
      ),
      false,
    );

    process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP = "true";
    assert.equal(
      developerBootstrapRequestIsAuthorized(
        new Headers({ host: "public.example.test" }),
      ),
      true,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousOperatorMode === undefined) {
      delete process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP;
    } else {
      process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP =
        previousOperatorMode;
    }
  }
});

test("garde le bootstrap localhost pour le développement", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    assert.equal(
      developerBootstrapRequestIsAuthorized(
        new Headers({ host: "localhost:3000" }),
      ),
      true,
    );
    assert.equal(
      developerBootstrapRequestIsAuthorized(
        new Headers({ host: "public.example.test" }),
      ),
      false,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("autorise les inscriptions additionnelles sans rouvrir le bootstrap initial", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRegistration = process.env.REVALOOP_ALLOW_REGISTRATION;
  const previousBootstrap =
    process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP;
  process.env.NODE_ENV = "production";
  process.env.REVALOOP_ALLOW_REGISTRATION = "true";
  delete process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP;
  const publicHeaders = new Headers({ host: "public.example.test" });

  try {
    assert.equal(
      developerRegistrationPolicyAllowsRequest(publicHeaders, false),
      false,
    );
    assert.equal(
      developerRegistrationPolicyAllowsRequest(publicHeaders, true),
      true,
    );

    delete process.env.REVALOOP_ALLOW_REGISTRATION;
    assert.equal(
      developerRegistrationPolicyAllowsRequest(publicHeaders, true),
      false,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousRegistration === undefined) {
      delete process.env.REVALOOP_ALLOW_REGISTRATION;
    } else {
      process.env.REVALOOP_ALLOW_REGISTRATION = previousRegistration;
    }

    if (previousBootstrap === undefined) {
      delete process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP;
    } else {
      process.env.REVALOOP_ALLOW_UNAUTHENTICATED_BOOTSTRAP =
        previousBootstrap;
    }
  }
});

test("refuse un ancien coût PBKDF2 incompatible avant Web Crypto", async () => {
  const password = "une phrase de passe réellement longue";
  const current = await hashDeveloperPassword(password);
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );
  let webCryptoCalled = false;

  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      subtle: {
        importKey() {
          webCryptoCalled = true;
          throw new Error("Web Crypto ne doit pas être appelé");
        },
      },
    },
  });

  try {
    assert.equal(
      await verifyDeveloperPassword(password, {
        ...current,
        passwordIterations: 600_000,
      }),
      false,
    );
  } finally {
    Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
  }

  assert.equal(webCryptoCalled, false);
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
