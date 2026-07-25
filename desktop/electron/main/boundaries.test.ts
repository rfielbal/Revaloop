import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assetPathForUrl } from "./protocol.ts";
import { externalUrlFor } from "./navigation.ts";

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
