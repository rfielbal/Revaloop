import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  createPilotServer,
  normalizePilotVariant,
  normalizeRevaloopOrigin,
} from "./server.mjs";

async function withServer(run, options = {}) {
  const server = createPilotServer({
    revaloopOrigin: "https://review.example",
    ...options,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeIdleConnections?.();
    server.close();
    await once(server, "close");
  }
}

test("sert les trois routes annotables avec des headers de recette stricts", async () => {
  await withServer(async (origin) => {
    for (const path of ["/", "/commandes", "/clients"]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^text\/html/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-frame-options"), null);
      assert.match(
        response.headers.get("content-security-policy"),
        /frame-ancestors 'self' https:\/\/review\.example/,
      );
      const html = await response.text();
      assert.match(html, /Atelier Onda/);
      assert.match(html, /data-revaloop-origin="https:\/\/review\.example"/);
      assert.match(html, /data-pilot-variant="initial"/);
    }
  });
});

test("expose seulement les fichiers attendus et un healthcheck sans état", async () => {
  await withServer(async (origin) => {
    const health = await fetch(`${origin}/health`);
    assert.deepEqual(await health.json(), {
      status: "ok",
      fixture: "revaloop-pilot-preview",
    });

    const script = await fetch(`${origin}/app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get("content-type"), /^text\/javascript/);

    assert.equal((await fetch(`${origin}/favicon.ico`)).status, 204);

    assert.equal((await fetch(`${origin}/server.mjs`)).status, 404);
    assert.equal((await fetch(`${origin}/../server.mjs`)).status, 404);

    const rejected = await fetch(`${origin}/`, { method: "POST" });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get("allow"), "GET, HEAD");
  });
});

test("accepte HTTPS et le loopback local, mais refuse les origines ambiguës", () => {
  assert.equal(
    normalizeRevaloopOrigin("https://review.example"),
    "https://review.example",
  );
  assert.equal(
    normalizeRevaloopOrigin("http://localhost:3000"),
    "http://localhost:3000",
  );
  assert.throws(() => normalizeRevaloopOrigin("http://review.example"), /HTTPS/);
  assert.throws(
    () => normalizeRevaloopOrigin("https://review.example/path?token=demo"),
    /ni chemin/,
  );
});

test("borne les deux variantes reproductibles du parcours de correction", async () => {
  assert.equal(normalizePilotVariant("initial"), "initial");
  assert.equal(normalizePilotVariant("corrected"), "corrected");
  assert.throws(() => normalizePilotVariant("production"), /initial/);

  await withServer(async (origin) => {
    const response = await fetch(origin);
    assert.match(await response.text(), /data-pilot-variant="corrected"/);
  }, { variant: "corrected" });
});
