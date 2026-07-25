import { access, realpath, stat, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { spawn, type ChildProcess } from "node:child_process";
import type {
  LogLine,
  ProjectInfo,
  RuntimeStatus,
} from "../shared/contract.ts";

const MAX_PACKAGE_JSON_BYTES = 1_048_576;
const MAX_SCRIPT_LENGTH = 1_024;
const MAX_LOG_LINE_LENGTH = 2_000;
const MAX_LOG_EVENTS = 20_000;
const NPM_RUN_ARGUMENTS = ["--ignore-scripts", "run", "dev"] as const;
const NPM_RUN_LABEL = "npm --ignore-scripts run dev";
const BLOCKED_PROJECT_ENVIRONMENT_KEYS = [
  "ELECTRON_ENABLE_SECURITY_WARNINGS",
  "ELECTRON_RENDERER_URL",
  "ELECTRON_RUN_AS_NODE",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NPM_CONFIG_NODE_OPTIONS",
] as const;

type PackageManifest = {
  name?: unknown;
  version?: unknown;
  packageManager?: unknown;
  scripts?: unknown;
};

type RuntimeEvents = {
  log: (line: LogLine) => void;
  status: (status: RuntimeStatus) => void;
};

function cleanLabel(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  const candidate = typeof value === "string" ? value : fallback;
  const cleaned = [...candidate]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .slice(0, maxLength)
    .join("");
  return cleaned.trim().length > 0 ? cleaned : fallback;
}

async function canonicalProjectPath(raw: string): Promise<string> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 32_768) {
    throw new Error("Le dossier choisi n’est pas accessible.");
  }
  const canonical = await realpath(raw).catch(() => {
    throw new Error("Le dossier choisi n’est pas accessible.");
  });
  const metadata = await stat(canonical);
  if (!metadata.isDirectory()) {
    throw new Error("Le projet choisi n’est pas un dossier.");
  }
  return canonical;
}

async function readManifest(path: string): Promise<PackageManifest> {
  const packagePath = join(path, "package.json");
  const metadata = await stat(packagePath).catch(() => {
    throw new Error("Le dossier choisi ne contient pas de package.json.");
  });
  if (!metadata.isFile() || metadata.size > MAX_PACKAGE_JSON_BYTES) {
    throw new Error("Le package.json est absent ou dépasse 1 Mio.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    throw new Error("Le package.json est invalide.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Le package.json est invalide.");
  }
  return parsed as PackageManifest;
}

export async function inspectProject(path: string): Promise<ProjectInfo> {
  const canonical = await canonicalProjectPath(path);
  const manifest = await readManifest(canonical);
  if (
    typeof manifest.scripts !== "object" ||
    manifest.scripts === null ||
    Array.isArray(manifest.scripts)
  ) {
    throw new Error(
      "Ce projet ne déclare aucun script « dev » dans package.json.",
    );
  }
  const devScript = (manifest.scripts as Record<string, unknown>).dev;
  if (typeof devScript !== "string") {
    throw new Error(
      "Ce projet ne déclare aucun script « dev » dans package.json.",
    );
  }
  if (devScript.length === 0 || devScript.length > MAX_SCRIPT_LENGTH) {
    throw new Error("Le script « dev » est vide ou trop long.");
  }

  const fallbackName = basename(canonical) || "Projet";
  const version =
    typeof manifest.version === "string"
      ? cleanLabel(manifest.version, "", 40) || null
      : null;

  return {
    path: canonical,
    name: cleanLabel(manifest.name, fallbackName, 100),
    version,
    devScript,
    packageManager: cleanLabel(manifest.packageManager, "npm", 80),
    command: NPM_RUN_LABEL,
  };
}

export function redactLogLine(raw: string): string {
  const cleaned = [...raw]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return character === "\t" || (code >= 0x20 && code !== 0x7f);
    })
    .slice(0, MAX_LOG_LINE_LENGTH)
    .join("");
  const lowercase = cleaned.toLowerCase();
  const sensitiveMarkers = [
    "authorization:",
    "proxy-authorization:",
    "cookie:",
    "set-cookie:",
    "password=",
    "passwd=",
    "secret=",
    "token=",
    "api_key=",
    "apikey=",
  ];
  return sensitiveMarkers.some((marker) => lowercase.includes(marker))
    ? "[ligne masquée : donnée potentiellement sensible]"
    : cleaned;
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(
      path,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function executableInPath(name: string): Promise<string | null> {
  const directories = (process.env.PATH ?? "")
    .split(process.platform === "win32" ? ";" : ":")
    .filter(Boolean);
  for (const directory of directories) {
    const candidate = join(directory, name);
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

async function latestNvmNpm(): Promise<string | null> {
  const versionsDirectory = join(homedir(), ".nvm", "versions", "node");
  let entries;
  try {
    entries = await readdir(versionsDirectory, { withFileTypes: true });
  } catch {
    return null;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(versionsDirectory, entry.name, "bin", "npm"))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

export async function findNpmExecutable(): Promise<string> {
  const executableName = process.platform === "win32" ? "npm.cmd" : "npm";
  const fromPath = await executableInPath(executableName);
  if (fromPath) return fromPath;

  const candidates =
    process.platform === "win32"
      ? []
      : [
          "/opt/homebrew/bin/npm",
          "/usr/local/bin/npm",
          join(homedir(), ".volta", "bin", "npm"),
          join(homedir(), ".asdf", "shims", "npm"),
          join(homedir(), ".local", "share", "mise", "shims", "npm"),
        ];
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  const nvm = await latestNvmNpm();
  if (nvm) return nvm;

  throw new Error(
    "npm est introuvable. Installez Node.js/npm ou lancez Revaloop depuis un terminal où npm est disponible.",
  );
}

export function projectRuntimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const key of BLOCKED_PROJECT_ENVIRONMENT_KEYS) {
    delete environment[key];
  }
  return {
    ...environment,
    BROWSER: "none",
    HOST: "127.0.0.1",
    NO_COLOR: "1",
  };
}

async function npmLaunch(): Promise<{
  command: string;
  arguments: string[];
}> {
  const npm = await findNpmExecutable();
  if (process.platform !== "win32") {
    return { command: npm, arguments: [...NPM_RUN_ARGUMENTS] };
  }

  const installationDirectory = dirname(npm);
  const nodeExecutable = join(installationDirectory, "node.exe");
  const npmCli = join(
    installationDirectory,
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (
    !(await isExecutable(nodeExecutable)) ||
    !(await isExecutable(npmCli))
  ) {
    throw new Error(
      "L’installation npm de Windows est incomplète ou inaccessible.",
    );
  }
  return {
    command: nodeExecutable,
    arguments: [npmCli, ...NPM_RUN_ARGUMENTS],
  };
}

function statusOf(child: ChildProcess | null): RuntimeStatus {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return { running: false, pid: null };
  }
  return {
    running: true,
    pid: child.pid ?? null,
  };
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("exit", onExit);
  });
}

async function runTaskkill(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const killer = spawn(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      },
    );
    killer.once("error", () => resolve());
    killer.once("exit", () => resolve());
  });
}

async function terminate(child: ChildProcess): Promise<boolean> {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return true;

  if (process.platform === "win32") {
    await runTaskkill(pid);
    if (!(await waitForExit(child, 1_000))) child.kill();
    return waitForExit(child, 500);
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  if (await waitForExit(child, 800)) return true;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
  return waitForExit(child, 500);
}

export class RuntimeManager {
  #child: ChildProcess | null = null;
  #events: RuntimeEvents;
  #logEvents = 0;
  #logLimitReported = false;
  #operationQueue: Promise<void> = Promise.resolve();
  #pendingStart: Promise<RuntimeStatus> | null = null;
  #starting = false;
  #stopRevision = 0;

  constructor(events: RuntimeEvents) {
    this.#events = events;
  }

  status(): RuntimeStatus {
    const current = statusOf(this.#child);
    if (!current.running) this.#child = null;
    if (this.#starting) {
      return {
        running: true,
        pid: current.running ? current.pid : null,
      };
    }
    return current;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #emitLog(stream: LogLine["stream"], line: string): void {
    if (this.#logEvents >= MAX_LOG_EVENTS) {
      if (!this.#logLimitReported) {
        this.#logLimitReported = true;
        this.#events.log({
          stream: "system",
          line: "Le journal a atteint sa limite et n’affichera plus de nouvelles lignes.",
        });
      }
      return;
    }
    this.#logEvents += 1;
    this.#events.log({ stream, line: redactLogLine(line) });
  }

  #pipeLogs(
    stream: NodeJS.ReadableStream | null,
    label: "stdout" | "stderr",
  ): void {
    if (!stream) return;
    const reader = createInterface({ input: stream });
    reader.on("line", (line) => this.#emitLog(label, line));
  }

  start(
    project: ProjectInfo,
    expectedScript: string,
  ): Promise<RuntimeStatus> {
    if (this.#pendingStart) {
      return Promise.reject(
        new Error("Un démarrage de projet est déjà en cours."),
      );
    }

    const stopRevision = this.#stopRevision;
    this.#starting = true;
    const request = this.#enqueue(async () => {
      try {
        if (stopRevision !== this.#stopRevision) {
          throw new Error("Le démarrage du projet a été annulé.");
        }
        if (statusOf(this.#child).running) {
          throw new Error("Un projet lancé par Revaloop est déjà actif.");
        }

        const current = await inspectProject(project.path);
        if (current.devScript !== expectedScript) {
          throw new Error(
            "Le script « dev » a changé depuis l’inspection. Vérifiez le projet puis réessayez.",
          );
        }
        if (!current.packageManager.startsWith("npm")) {
          throw new Error(
            "Cette alpha exécute uniquement npm. Lancez les autres gestionnaires manuellement.",
          );
        }

        const launch = await npmLaunch();
        if (stopRevision !== this.#stopRevision) {
          throw new Error("Le démarrage du projet a été annulé.");
        }

        const child = spawn(launch.command, launch.arguments, {
          cwd: current.path,
          detached: process.platform !== "win32",
          env: projectRuntimeEnvironment(),
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });
        this.#child = child;
        child.once("exit", () => {
          if (this.#child === child) {
            this.#child = null;
            this.#events.status({ running: false, pid: null });
          }
        });

        try {
          await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => {
              child.off("spawn", onSpawn);
              reject(
                new Error(
                  `Impossible de lancer ${NPM_RUN_LABEL} : ${error.message}`,
                ),
              );
            };
            const onSpawn = () => {
              child.off("error", onError);
              resolve();
            };
            child.once("error", onError);
            child.once("spawn", onSpawn);
          });
        } catch (error) {
          const terminated = await terminate(child);
          if (terminated && this.#child === child) this.#child = null;
          throw error;
        }

        if (stopRevision !== this.#stopRevision) {
          const terminated = await terminate(child);
          if (!terminated) {
            const status = statusOf(child);
            this.#events.status(status);
            throw new Error(
              "Le démarrage a été annulé, mais son processus n’a pas pu être arrêté.",
            );
          }
          if (this.#child === child) this.#child = null;
          this.#events.status({ running: false, pid: null });
          throw new Error("Le démarrage du projet a été annulé.");
        }

        this.#logEvents = 0;
        this.#logLimitReported = false;
        this.#pipeLogs(child.stdout, "stdout");
        this.#pipeLogs(child.stderr, "stderr");
        const status = statusOf(child);
        this.#events.status(status);
        return status;
      } finally {
        this.#starting = false;
      }
    });

    this.#pendingStart = request;
    void request.then(
      () => {
        if (this.#pendingStart === request) this.#pendingStart = null;
      },
      () => {
        if (this.#pendingStart === request) this.#pendingStart = null;
      },
    );
    return request;
  }

  stop(): Promise<RuntimeStatus> {
    this.#stopRevision += 1;
    return this.#enqueue(async () => {
      const child = this.#child;
      if (child) {
        const terminated = await terminate(child);
        if (!terminated) {
          const status = statusOf(child);
          this.#events.status(status);
          throw new Error(
            "Le processus du projet n’a pas pu être arrêté.",
          );
        }
        if (this.#child === child) this.#child = null;
      }
      const status: RuntimeStatus = { running: false, pid: null };
      this.#events.status(status);
      return status;
    });
  }
}
