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
  DEFAULT_CONTROL_PLANE_URL,
  DEFAULT_PREVIEW_URL,
} from "../shared/contract.ts";
import {
  normalizeControlPlaneUrl,
  normalizeLoopbackUrl,
  parseSettingsInput,
} from "./validation.ts";

const SETTINGS_FILENAME = "settings.json";
const MAX_SETTINGS_BYTES = 64 * 1_024;

export function defaultDesktopSettings(
  controlPlaneOverride = process.env.REVALOOP_CONTROL_PLANE_URL,
): DesktopSettings {
  return {
    projectPath: null,
    previewUrl: DEFAULT_PREVIEW_URL,
    controlPlaneUrl: normalizeControlPlaneUrl(
      controlPlaneOverride ?? DEFAULT_CONTROL_PLANE_URL,
    ).toString(),
  };
}

function parseStoredSettings(
  value: unknown,
  defaults: DesktopSettings,
): { settings: DesktopSettings; migrated: boolean } {
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
  const previewUrl = normalizeLoopbackUrl(record.previewUrl).toString();
  const storedControlPlaneUrl = normalizeControlPlaneUrl(
    record.controlPlaneUrl,
  ).toString();
  const migrated =
    previewUrl === DEFAULT_PREVIEW_URL &&
    storedControlPlaneUrl === DEFAULT_PREVIEW_URL;

  return {
    migrated,
    settings: {
      projectPath: record.projectPath,
      previewUrl,
      controlPlaneUrl: migrated
        ? defaults.controlPlaneUrl
        : storedControlPlaneUrl,
    },
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
  readonly #defaults: DesktopSettings;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(configDirectory: string, controlPlaneOverride?: string) {
    this.path = join(configDirectory, SETTINGS_FILENAME);
    this.#defaults = defaultDesktopSettings(controlPlaneOverride);
  }

  async #persist(settings: DesktopSettings): Promise<void> {
    const serialized = new TextEncoder().encode(
      `${JSON.stringify(settings, null, 2)}\n`,
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
        return { ...this.#defaults };
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
    const result = parseStoredSettings(parsed, this.#defaults);
    if (result.migrated) {
      await this.#persist(result.settings);
    }
    return result.settings;
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
    await this.#persist(next);
    return next;
  }
}
