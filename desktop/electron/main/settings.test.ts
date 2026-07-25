import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SettingsStore } from "./settings.ts";

test("écrit puis relit atomiquement une configuration non secrète", async () => {
  const directory = await mkdtemp(join(tmpdir(), "revaloop-settings-"));
  try {
    const store = new SettingsStore(directory);
    assert.deepEqual(await store.read(), {
      projectPath: null,
      previewUrl: "http://127.0.0.1:3000/",
      controlPlaneUrl: "http://127.0.0.1:3000/",
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
