import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_CONTROL_PLANE_URL,
  DEFAULT_PREVIEW_URL,
} from "../shared/contract.ts";
import { SettingsStore, defaultDesktopSettings } from "./settings.ts";

test("écrit puis relit atomiquement une configuration non secrète", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-settings-"));
  try {
    const store = new SettingsStore(directory);
    assert.deepEqual(await store.read(), {
      projectPath: null,
      previewUrl: DEFAULT_PREVIEW_URL,
      controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL,
    });

    const saved = await store.save(
      {
        previewUrl: "http://localhost:4173",
        controlPlaneUrl: "https://revaloop.example",
      },
      null,
    );
    assert.deepEqual(await store.read(), saved);
    if (process.platform !== "win32") {
      const mode = (await stat(store.path)).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("autorise une instance Revaloop par défaut configurable et sécurisée", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-settings-override-"));
  try {
    const store = new SettingsStore(
      directory,
      "https://recette.revaloop.example",
    );
    assert.deepEqual(await store.read(), {
      projectPath: null,
      previewUrl: DEFAULT_PREVIEW_URL,
      controlPlaneUrl: "https://recette.revaloop.example/",
    });
    assert.throws(
      () => defaultDesktopSettings("http://revaloop.example"),
      /HTTPS, ou HTTP en local/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migre seulement l’ancien couple de valeurs par défaut ambiguës", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-settings-migration-"));
  const customDirectory = await mkdtemp(
    join(tmpdir(), "revaloop-settings-custom-"),
  );
  try {
    const legacyStore = new SettingsStore(directory);
    await legacyStore.save(
      {
        previewUrl: DEFAULT_PREVIEW_URL,
        controlPlaneUrl: DEFAULT_PREVIEW_URL,
      },
      "/projets/site-client",
    );

    assert.deepEqual(await legacyStore.read(), {
      projectPath: "/projets/site-client",
      previewUrl: DEFAULT_PREVIEW_URL,
      controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL,
    });
    assert.deepEqual(await new SettingsStore(directory).read(), {
      projectPath: "/projets/site-client",
      previewUrl: DEFAULT_PREVIEW_URL,
      controlPlaneUrl: DEFAULT_CONTROL_PLANE_URL,
    });

    const customStore = new SettingsStore(customDirectory);
    await customStore.save(
      {
        previewUrl: "http://127.0.0.1:4173/",
        controlPlaneUrl: DEFAULT_PREVIEW_URL,
      },
      null,
    );
    assert.equal(
      (await customStore.read()).controlPlaneUrl,
      DEFAULT_PREVIEW_URL,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(customDirectory, { recursive: true, force: true });
  }
});
