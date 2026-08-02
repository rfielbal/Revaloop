import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assetPathForUrl } from "./protocol.ts";
import {
  connectPreviewUrlFor,
  externalUrlFor,
  quickTunnelPreviewUrl,
} from "./navigation.ts";

test("sert uniquement les assets contenus dans le bundle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-assets-"));
  try {
    assert.equal(
      assetPathForUrl(directory, "revaloop://app/"),
      resolve(directory, "index.html"),
    );
    assert.equal(
      assetPathForUrl(directory, "revaloop://app/assets/main.js"),
      resolve(directory, "assets/main.js"),
    );
    assert.throws(() =>
      assetPathForUrl(directory, "revaloop://evil/index.html"),
    );
    assert.throws(() =>
      assetPathForUrl(directory, "revaloop://app/%2Ftmp/secret"),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transmet uniquement un quick tunnel actif via le fragment local", () => {
  const settings = {
    projectPath: null,
    previewUrl: "http://127.0.0.1:3000/",
    controlPlaneUrl: "https://revaloop.example/",
  };
  const publicUrl = "https://calm-demo-tree.trycloudflare.com/";
  assert.equal(quickTunnelPreviewUrl(publicUrl).toString(), publicUrl);
  const destination = connectPreviewUrlFor(settings, publicUrl);
  assert.equal(destination.origin, "https://revaloop.example");
  assert.equal(destination.pathname, "/connect-preview");
  assert.equal(
    new URLSearchParams(destination.hash.slice(1)).get("url"),
    publicUrl,
  );
  assert.equal(destination.search, "");

  for (const invalid of [
    "https://preview.example/",
    "http://calm-demo-tree.trycloudflare.com/",
    "https://calm-demo-tree.trycloudflare.com.evil.example/",
  ]) {
    assert.throws(() => connectPreviewUrlFor(settings, invalid));
  }
});

test("construit seulement les trois destinations externes prévues", () => {
  const settings = {
    projectPath: null,
    previewUrl: "http://127.0.0.1:3000/",
    controlPlaneUrl: "https://revaloop.example/",
  };
  assert.equal(
    externalUrlFor(settings, "preview").toString(),
    "http://127.0.0.1:3000/",
  );
  assert.equal(
    externalUrlFor(settings, "dashboard").toString(),
    "https://revaloop.example/dashboard",
  );
  assert.equal(
    externalUrlFor(settings, "login").toString(),
    "https://revaloop.example/login",
  );
});
