import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  DesktopSettings,
  SettingsInput,
} from "../shared/contract.ts";
import {
  normalizeControlPlaneUrl,
  normalizeLoopbackUrl,
  parseSettingsInput,
} from "./validation.ts";

const SETTINGS_FILENAME = "settings.json";
const MAX_SETTINGS_BYTES = 64 * 1_024;
const DEFAULT_SETTINGS: DesktopSettings = Object.freeze({
  projectPath: null,
  previewUrl: "http://127.0.0.1:3000/",
  controlPlaneUrl: "http://127.0.0.1:3000/",
});

function parseStoredSettings(value: unknown): DesktopSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("La configuration locale est illisible.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.projectPath !== null &&
    typeof record.projectPath !== "string"
  ) {
    throw new Error("Le chemin de projet mémorisé est invalide.");
  }
  return {
    projectPath: record.projectPath,
    previewUrl: normalizeLoopbackUrl(record.previewUrl).toString(),
    controlPlaneUrl: normalizeControlPlaneUrl(
      record.controlPlaneUrl,
    ).toString(),
  };
}

async function atomicWrite(path: string, contents: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, {
    flag: "w",
    mode: 0o600,
  });
  if (process.platform !== "win32") {
    await chmod(temporaryPath, 0o600);
  }
  if (process.platform === "win32") {
    await rm(path, { force: true });
  }
  await rename(temporaryPath, path);
}

export class SettingsStore {
  readonly path: string;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(configDirectory: string) {
    this.path = join(configDirectory, SETTINGS_FILENAME);
  }

  async read(): Promise<DesktopSettings> {
    try {
      const metadata = await stat(this.path);
      if (!metadata.isFile() || metadata.size > MAX_SETTINGS_BYTES) {
        throw new Error(
          "La configuration locale dépasse la taille autorisée.",
        );
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { ...DEFAULT_SETTINGS };
      }
      throw error;
    }

    const bytes = await readFile(this.path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("La configuration locale est illisible.");
    }
    return parseStoredSettings(parsed);
  }

  async save(
    input: unknown,
    projectPath: string | null,
  ): Promise<DesktopSettings> {
    const normalized: SettingsInput = parseSettingsInput(input);
    const next: DesktopSettings = {
      projectPath,
      ...normalized,
    };
    const serialized = new TextEncoder().encode(
      `${JSON.stringify(next, null, 2)}\n`,
    );
    if (serialized.byteLength > MAX_SETTINGS_BYTES) {
      throw new Error(
        "La configuration locale dépasse la taille autorisée.",
      );
    }

    const write = this.#writeQueue.then(() =>
      atomicWrite(this.path, serialized),
    );
    this.#writeQueue = write.catch(() => undefined);
    await write;
    return next;
  }
}
