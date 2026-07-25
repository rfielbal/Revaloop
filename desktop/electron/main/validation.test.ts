import test from "node:test";
import assert from "node:assert/strict";
import {
  isTrustedRendererUrl,
  normalizeControlPlaneUrl,
  normalizeLoopbackUrl,
  parseExternalTarget,
  parseSettingsInput,
  resolveRendererDevUrl,
} from "./validation.ts";

test("normalise uniquement les URLs de preview loopback sans secret", () => {
  assert.equal(
    normalizeLoopbackUrl("http://localhost:3000/preview").toString(),
    "http://127.0.0.1:3000/preview",
  );
  assert.equal(
    normalizeLoopbackUrl("http://127.22.3.4:4173/").hostname,
    "127.22.3.4",
  );
  assert.equal(normalizeLoopbackUrl("https://[::1]:444/").port, "444");

  for (const url of [
    "https://example.com",
    "http://user:pass@127.0.0.1:3000",
    "http://127.0.0.1:3000?token=secret",
    "file:///tmp/index.html",
  ]) {
    assert.throws(() => normalizeLoopbackUrl(url));
  }
});

test("valide une origine de contrôle HTTPS ou HTTP strictement locale", () => {
  assert.equal(
    normalizeControlPlaneUrl("https://revaloop.example").toString(),
    "https://revaloop.example/",
  );
  assert.equal(
    normalizeControlPlaneUrl("http://127.0.0.1:3000").toString(),
    "http://127.0.0.1:3000/",
  );
  assert.throws(() =>
    normalizeControlPlaneUrl("http://revaloop.example"),
  );
  assert.throws(() =>
    normalizeControlPlaneUrl("https://revaloop.example/dashboard"),
  );
});

test("rejette les champs IPC inattendus et les destinations libres", () => {
  assert.deepEqual(
    parseSettingsInput({
      previewUrl: "http://127.0.0.1:3000",
      controlPlaneUrl: "https://revaloop.example",
    }),
    {
      previewUrl: "http://127.0.0.1:3000/",
      controlPlaneUrl: "https://revaloop.example/",
    },
  );
  assert.throws(() =>
    parseSettingsInput({
      previewUrl: "http://127.0.0.1:3000",
      controlPlaneUrl: "https://revaloop.example",
      projectPath: "/tmp/forbidden",
    }),
  );
  assert.equal(parseExternalTarget("dashboard"), "dashboard");
  assert.throws(() => parseExternalTarget("https://evil.example"));
});

test("n’active le renderer Vite qu’en développement sur l’origine exacte", () => {
  assert.equal(
    resolveRendererDevUrl(false, "http://127.0.0.1:1420"),
    "http://127.0.0.1:1420/",
  );
  assert.equal(
    resolveRendererDevUrl(true, "https://evil.example"),
    null,
  );
  for (const url of [
    "http://localhost:1420/",
    "http://127.0.0.1:1421/",
    "http://user@127.0.0.1:1420/",
    "http://127.0.0.1:1420/?token=secret",
    "https://127.0.0.1:1420/",
    "https://evil.example/",
  ]) {
    assert.throws(() => resolveRendererDevUrl(false, url));
  }
});

test("valide strictement l’URL de la frame qui appelle l’IPC", () => {
  assert.equal(
    isTrustedRendererUrl(
      "http://127.0.0.1:1420/",
      "http://127.0.0.1:1420/",
    ),
    true,
  );
  assert.equal(
    isTrustedRendererUrl(
      "http://127.0.0.1:1420/iframe",
      "http://127.0.0.1:1420/",
    ),
    false,
  );
  assert.equal(isTrustedRendererUrl("revaloop://app/", null), true);
  assert.equal(
    isTrustedRendererUrl("revaloop://app/index.html", null),
    false,
  );
  assert.equal(
    isTrustedRendererUrl("https://revaloop.example/", null),
    false,
  );
});
