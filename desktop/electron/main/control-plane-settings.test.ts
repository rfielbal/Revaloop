import test from "node:test";
import assert from "node:assert/strict";
import type { DesktopSettings } from "../shared/contract.ts";
import { persistControlPlaneSettings } from "../shared/control-plane-settings.ts";

const PERSISTED: DesktopSettings = {
  projectPath: "/tmp/revaloop",
  previewUrl: "http://127.0.0.1:3000/",
  controlPlaneUrl: "https://revaloop.example/",
};

test("utilise la configuration normalisée renvoyée après enregistrement", async () => {
  const candidate = {
    ...PERSISTED,
    controlPlaneUrl: "https://nouvelle-instance.example",
  };
  const result = await persistControlPlaneSettings({
    candidate,
    persisted: PERSISTED,
    save: async (settings) => ({
      ...settings,
      controlPlaneUrl: `${settings.controlPlaneUrl}/`,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.settings.controlPlaneUrl,
    "https://nouvelle-instance.example/",
  );
  assert.equal(result.message, "Instance enregistrée.");
});

test("restaure uniquement la dernière instance valide si l’enregistrement échoue", async () => {
  const candidate: DesktopSettings = {
    projectPath: "/tmp/nouveau-projet",
    previewUrl: "http://127.0.0.1:4173/",
    controlPlaneUrl: "http://instance-publique-invalide.example",
  };
  const result = await persistControlPlaneSettings({
    candidate,
    persisted: PERSISTED,
    save: async () => {
      throw new Error("HTTPS est requis.");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.settings, {
    ...candidate,
    controlPlaneUrl: PERSISTED.controlPlaneUrl,
  });
  assert.match(result.message, /dernière valeur valide a été restaurée/);
  assert.match(result.message, /HTTPS est requis/);
});
