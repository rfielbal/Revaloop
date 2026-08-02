import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeConnectedPreviewUrl,
  normalizePreviewUrl,
  PreviewUrlError,
} from "../lib/preview-url.ts";

test("normalise une URL HTTPS publique transmise par le compagnon", () => {
  assert.equal(
    normalizeConnectedPreviewUrl(
      " https://pilot-demo.trycloudflare.com/parcours#local ",
    ),
    "https://pilot-demo.trycloudflare.com/parcours",
  );
});

test("refuse les URLs non HTTPS, authentifiées ou porteuses de paramètres", () => {
  for (const candidate of [
    "http://example.test",
    "ftp://localhost:21/",
    "ws://localhost:3000/",
    "https://user:password@example.test",
    "https://example.test/?token=secret",
  ]) {
    assert.throws(
      () => normalizeConnectedPreviewUrl(candidate),
      PreviewUrlError,
    );
  }
});

test("refuse les adresses locales, privées et réservées", () => {
  for (const candidate of [
    "https://localhost:3000",
    "https://localhost./",
    "https://foo.localhost./",
    "https://app.local",
    "https://app.local./",
    "https://127.0.0.1",
    "https://10.0.0.4",
    "https://172.16.2.4",
    "https://192.168.1.12",
    "https://[::1]",
    "https://[fd00::4]",
    "https://[::ffff:7f00:1]/",
    "https://[::ffff:a00:1]/",
    "https://[::ffff:c0a8:101]/",
  ]) {
    assert.throws(
      () => normalizeConnectedPreviewUrl(candidate),
      PreviewUrlError,
    );
  }
});

test("conserve uniquement le loopback HTTP explicitement autorisé en local", () => {
  assert.equal(
    normalizePreviewUrl("http://localhost:3000", { allowLocal: true }),
    "http://localhost:3000/",
  );
  assert.throws(
    () => normalizePreviewUrl("http://192.168.1.20:3000", { allowLocal: true }),
    PreviewUrlError,
  );
  assert.throws(
    () => normalizePreviewUrl("http://localhost.:3000", { allowLocal: true }),
    PreviewUrlError,
  );
  assert.throws(
    () => normalizePreviewUrl("ftp://localhost:21/", { allowLocal: true }),
    PreviewUrlError,
  );
  assert.throws(
    () => normalizePreviewUrl("ws://localhost:3000/", { allowLocal: true }),
    PreviewUrlError,
  );
});

test("retire le point DNS terminal d’un hostname public", () => {
  assert.equal(
    normalizeConnectedPreviewUrl("https://preview.example./parcours"),
    "https://preview.example/parcours",
  );
});
