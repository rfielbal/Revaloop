import test from "node:test";
import assert from "node:assert/strict";
import type { DesktopSettings } from "../shared/contract.ts";
import { persistPreviewSettings } from "../shared/preview-settings.ts";

const PERSISTED: DesktopSettings = {
  projectPath: "/tmp/revaloop",
  previewUrl: "http://127.0.0.1:3000/",
  controlPlaneUrl: "https://revaloop.example/",
};

test("utilise la preview normalisée renvoyée après enregistrement", async () => {
  const candidate = {
    ...PERSISTED,
    previewUrl: "http://localhost:4173",
  };
  const result = await persistPreviewSettings({
    candidate,
    persisted: PERSISTED,
    save: async (settings) => ({
      ...settings,
      previewUrl: "http://127.0.0.1:4173/",
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.settings.previewUrl, "http://127.0.0.1:4173/");
  assert.equal(result.message, "Adresse locale enregistrée.");
});

test("restaure uniquement la dernière preview valide en cas d’échec", async () => {
  const candidate: DesktopSettings = {
    projectPath: "/tmp/nouveau-projet",
    previewUrl: "https://preview-distante-invalide.example",
    controlPlaneUrl: "https://nouvelle-instance.example/",
  };
  const result = await persistPreviewSettings({
    candidate,
    persisted: PERSISTED,
    save: async () => {
      throw new Error("Une adresse loopback est requise.");
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.settings, {
    ...candidate,
    previewUrl: PERSISTED.previewUrl,
  });
  assert.match(result.message, /dernière valeur valide a été restaurée/);
  assert.match(result.message, /loopback est requise/);
});
