import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { once } from "node:events";
import { probePreview } from "./preview.ts";

test("valide une vraie réponse HTTP sur le chemin exact", async () => {
  let requestedPath = "";
  let requestedMethod = "";
  const server = createHttpServer((request, response) => {
    requestedPath = request.url ?? "";
    requestedMethod = request.method ?? "";
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    });
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await probePreview(
      `http://127.0.0.1:${address.port}/recette`,
    );
    assert.equal(result.reachable, true);
    assert.equal(requestedMethod, "HEAD");
    assert.equal(requestedPath, "/recette");
    assert.match(result.message, /preview HTTP répond/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("refuse une API JSON ou une page HTTP en erreur", async () => {
  const server = createHttpServer((request, response) => {
    if (request.url === "/api") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
      return;
    }
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end("introuvable");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    assert.equal(
      (await probePreview(`http://127.0.0.1:${address.port}/api`)).reachable,
      false,
    );
    assert.equal(
      (await probePreview(`http://127.0.0.1:${address.port}/missing`))
        .reachable,
      false,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("retente par un GET borné lorsque HEAD n’est pas pris en charge", async () => {
  const methods: string[] = [];
  const server = createHttpServer((request, response) => {
    methods.push(request.method ?? "");
    if (request.method === "HEAD") {
      response.writeHead(405, { Allow: "GET" });
      response.end();
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Preview</title>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await probePreview(`http://127.0.0.1:${address.port}/`);
    assert.equal(result.reachable, true);
    assert.deepEqual(methods, ["HEAD", "GET"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("refuse un port TCP qui ne parle pas HTTP", async () => {
  const server = createTcpServer((socket) => {
    socket.end("service local non HTTP\n", () => socket.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const result = await probePreview(`http://127.0.0.1:${address.port}/`);
    assert.equal(result.reachable, false);
    assert.match(result.message, /Aucune réponse HTTP valide/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
