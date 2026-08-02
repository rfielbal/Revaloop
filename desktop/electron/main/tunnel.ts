import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import type {
  LogLine,
  TunnelStatus,
} from "../shared/contract.ts";
import { normalizeLoopbackUrl } from "./validation.ts";

const DEFAULT_START_TIMEOUT_MS = 20_000;
const EXECUTABLE_CHECK_TIMEOUT_MS = 2_000;
const DEFAULT_STOP_GRACE_MS = 1_200;
const DEFAULT_STOP_KILL_MS = 700;
const MAX_TUNNEL_LOG_LINE_LENGTH = 1_000;
const MAX_TUNNEL_LOG_EVENTS = 500;
const QUICK_TUNNEL_HOSTNAME =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;
const READY_MARKERS = [
  /registered tunnel connection/i,
  /connection .+ registered/i,
] as const;

type TunnelEvents = {
  log: (line: LogLine) => void;
  status: (status: TunnelStatus) => void;
};

type SpawnTunnel = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

type TunnelDependencies = {
  findExecutable?: () => Promise<string | null>;
  spawnProcess?: SpawnTunnel;
  startTimeoutMs?: number;
  stopGraceMs?: number;
  stopKillMs?: number;
};

const INITIAL_STATUS: TunnelStatus = {
  state: "checking",
  available: null,
  url: null,
  message: "Recherche de cloudflared sur ce poste…",
};

function cleanText(raw: string, maxLength: number): string {
  return [...raw]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return character === "\t" || (code >= 0x20 && code !== 0x7f);
    })
    .slice(0, maxLength)
    .join("")
    .trim();
}

export function extractQuickTunnelUrl(raw: string): string | null {
  const cleaned = cleanText(raw, 8_192);
  const candidates = cleaned.match(/https:\/\/[^\s"'`<>|]+/gi) ?? [];
  for (const rawCandidate of candidates) {
    const candidate = rawCandidate.replace(/[),.;!]+$/g, "");
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      QUICK_TUNNEL_HOSTNAME.test(url.hostname.toLowerCase())
    ) {
      return url.toString();
    }
  }
  return null;
}

export function isValidQuickTunnelUrl(raw: unknown): raw is string {
  return typeof raw === "string" && extractQuickTunnelUrl(raw) === raw;
}

export function redactTunnelLogLine(raw: string): string {
  const cleaned = cleanText(raw, MAX_TUNNEL_LOG_LINE_LENGTH);
  const lowercase = cleaned.toLowerCase();
  const sensitiveMarkers = [
    "authorization",
    "cookie",
    "credential",
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "origin cert",
  ];
  if (sensitiveMarkers.some((marker) => lowercase.includes(marker))) {
    return "[journal cloudflared masqué : donnée potentiellement sensible]";
  }
  return cleaned
    .replace(/https?:\/\/[^\s"'`<>|]+/gi, "[adresse masquée]")
    .replace(/([?&][a-z0-9_.-]+)=([^\s&]+)/gi, "$1=[masqué]");
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

export async function findCloudflaredExecutable({
  source = process.env,
  extraCandidates = [],
}: {
  source?: NodeJS.ProcessEnv;
  extraCandidates?: readonly string[];
} = {}): Promise<string | null> {
  const executableName =
    process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const separator = process.platform === "win32" ? ";" : ":";
  const fromPath = (source.PATH ?? "")
    .split(separator)
    .filter(Boolean)
    .map((directory) => join(directory, executableName));
  const standard =
    process.platform === "win32"
      ? [
          join(
            source.ProgramFiles ?? "C:\\Program Files",
            "cloudflared",
            executableName,
          ),
        ]
      : [
          "/opt/homebrew/bin/cloudflared",
          "/usr/local/bin/cloudflared",
          "/usr/bin/cloudflared",
          join(homedir(), ".local", "bin", "cloudflared"),
        ];
  for (const candidate of [...fromPath, ...extraCandidates, ...standard]) {
    if (await isExecutable(candidate)) return candidate;
  }
  return null;
}

export function tunnelEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  const allowedKeys = [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "TMPDIR",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ] as const;
  for (const key of allowedKeys) {
    if (source[key] !== undefined) environment[key] = source[key];
  }
  environment.NO_AUTOUPDATE = "true";
  return environment;
}

export function quickTunnelArguments(previewUrl: string): string[] {
  const normalized = normalizeLoopbackUrl(previewUrl);
  return [
    "tunnel",
    "--config",
    process.platform === "win32" ? "NUL" : "/dev/null",
    "--no-autoupdate",
    "--loglevel",
    "info",
    "--url",
    normalized.toString(),
    "--http-host-header",
    normalized.host,
  ];
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

async function terminateTunnel(
  child: ChildProcess,
  graceMs: number,
  killMs: number,
): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  child.kill("SIGTERM");
  if (await waitForExit(child, graceMs)) return true;
  child.kill("SIGKILL");
  return waitForExit(child, killMs);
}

function isConnectionReady(line: string): boolean {
  return READY_MARKERS.some((marker) => marker.test(line));
}

function validatedDuration(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < 25 || candidate > maximum) {
    throw new Error("La durée d’exécution du tunnel est invalide.");
  }
  return candidate;
}

function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, timeoutMs);
    void promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export class TunnelManager {
  #child: ChildProcess | null = null;
  #events: TunnelEvents;
  #findExecutable: () => Promise<string | null>;
  #spawnProcess: SpawnTunnel;
  #startTimeoutMs: number;
  #stopGraceMs: number;
  #stopKillMs: number;
  #status: TunnelStatus = { ...INITIAL_STATUS };
  #pendingStart: Promise<TunnelStatus> | null = null;
  #pendingStop: Promise<TunnelStatus> | null = null;
  #revision = 0;
  #logEvents = 0;

  constructor(events: TunnelEvents, dependencies: TunnelDependencies = {}) {
    this.#events = events;
    this.#findExecutable =
      dependencies.findExecutable ?? (() => findCloudflaredExecutable());
    this.#spawnProcess =
      dependencies.spawnProcess ??
      ((command, args, options) => spawn(command, [...args], options));
    this.#startTimeoutMs = validatedDuration(
      dependencies.startTimeoutMs,
      DEFAULT_START_TIMEOUT_MS,
      60_000,
    );
    this.#stopGraceMs = validatedDuration(
      dependencies.stopGraceMs,
      DEFAULT_STOP_GRACE_MS,
      10_000,
    );
    this.#stopKillMs = validatedDuration(
      dependencies.stopKillMs,
      DEFAULT_STOP_KILL_MS,
      10_000,
    );
  }

  status(): TunnelStatus {
    return { ...this.#status };
  }

  hasActiveProcess(): boolean {
    return Boolean(
      (this.#child &&
        this.#child.exitCode === null &&
        this.#child.signalCode === null) ||
        this.#pendingStart ||
        this.#pendingStop,
    );
  }

  #setStatus(status: TunnelStatus): TunnelStatus {
    this.#status = { ...status };
    this.#events.status(this.status());
    return this.status();
  }

  #emitLog(raw: string): void {
    if (this.#logEvents >= MAX_TUNNEL_LOG_EVENTS) return;
    const line = redactTunnelLogLine(raw);
    if (!line) return;
    this.#logEvents += 1;
    this.#events.log({ stream: "system", line: `Tunnel · ${line}` });
  }

  async refreshStatus(): Promise<TunnelStatus> {
    if (this.#child || this.#pendingStart || this.#pendingStop) {
      return this.status();
    }
    let executable: string | null;
    try {
      executable = await within(
        this.#findExecutable(),
        EXECUTABLE_CHECK_TIMEOUT_MS,
        "La recherche de cloudflared a dépassé le délai prévu.",
      );
    } catch (error) {
      this.#setStatus({
        state: "error",
        available: null,
        url: null,
        message:
          error instanceof Error
            ? error.message
            : "La recherche de cloudflared a échoué.",
      });
      throw error;
    }
    return this.#setStatus(
      executable
        ? {
            state: "offline",
            available: true,
            url: null,
            message: "cloudflared est prêt. Aucun lien public n’est actif.",
          }
        : {
            state: "unavailable",
            available: false,
            url: null,
            message:
              "cloudflared est absent. Installez-le vous-même puis relancez la vérification.",
          },
    );
  }

  start(rawPreviewUrl: unknown): Promise<TunnelStatus> {
    if (this.#pendingStart) {
      return Promise.reject(
        new Error("Un démarrage de tunnel est déjà en cours."),
      );
    }
    if (this.#pendingStop) {
      return Promise.reject(new Error("Le tunnel est en cours d’arrêt."));
    }
    if (this.#child) {
      return Promise.reject(new Error("Un tunnel est déjà actif."));
    }

    const previewUrl = normalizeLoopbackUrl(rawPreviewUrl).toString();
    const revision = this.#revision;
    this.#logEvents = 0;
    this.#setStatus({
      state: "starting",
      available: null,
      url: null,
      message: "Création du lien public temporaire…",
    });

    const request = (async () => {
      let child: ChildProcess | null = null;
      const deadline = Date.now() + this.#startTimeoutMs;
      try {
        const executable = await within(
          this.#findExecutable(),
          Math.min(EXECUTABLE_CHECK_TIMEOUT_MS, this.#startTimeoutMs),
          "La recherche de cloudflared a dépassé le délai prévu.",
        );
        if (revision !== this.#revision) {
          throw new Error("Le démarrage du tunnel a été annulé.");
        }
        if (!executable) {
          this.#setStatus({
            state: "unavailable",
            available: false,
            url: null,
            message:
              "cloudflared est absent. Revaloop ne l’installe jamais automatiquement.",
          });
          throw new Error(
            "cloudflared est introuvable. Installez-le manuellement, puis réessayez.",
          );
        }

        child = this.#spawnProcess(
          executable,
          quickTunnelArguments(previewUrl),
          {
            detached: false,
            env: tunnelEnvironment(),
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        this.#child = child;
        const runningChild = child;
        child.once("exit", () => {
          if (this.#child !== child) return;
          this.#child = null;
          if (this.#status.state !== "stopping") {
            this.#setStatus({
              state: "error",
              available: true,
              url: null,
              message: "Le tunnel s’est interrompu. Le lien n’est plus accessible.",
            });
          }
        });

        const remainingStartMs = deadline - Date.now();
        if (remainingStartMs < 25) {
          throw new Error(
            "cloudflared n’a pas confirmé le tunnel dans le délai prévu.",
          );
        }
        const publicUrl = await new Promise<string>((resolve, reject) => {
          let discoveredUrl: string | null = null;
          let connected = false;
          let settled = false;
          const readers = [runningChild.stdout, runningChild.stderr]
            .filter((stream): stream is Readable => stream !== null)
            .map((stream) => createInterface({ input: stream }));
          const cleanup = () => {
            clearTimeout(timeout);
            runningChild.off("error", onError);
            runningChild.off("exit", onExit);
          };
          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve(discoveredUrl as string);
          };
          const inspectLine = (line: string) => {
            this.#emitLog(line);
            discoveredUrl ??= extractQuickTunnelUrl(line);
            connected ||= isConnectionReady(line);
            if (discoveredUrl && connected) finish();
          };
          const onError = () =>
            finish(new Error("cloudflared n’a pas pu être lancé."));
          const onExit = () =>
            finish(
              new Error(
                "cloudflared s’est arrêté avant de créer le lien public.",
              ),
            );
          const timeout = setTimeout(
            () =>
              finish(
                new Error(
                  "cloudflared n’a pas confirmé le tunnel dans le délai prévu.",
                ),
              ),
            remainingStartMs,
          );
          for (const reader of readers) reader.on("line", inspectLine);
          runningChild.once("close", () => {
            for (const reader of readers) reader.close();
          });
          runningChild.once("error", onError);
          runningChild.once("exit", onExit);
        });

        if (
          revision !== this.#revision ||
          this.#child !== child ||
          !isValidQuickTunnelUrl(publicUrl)
        ) {
          throw new Error("Le démarrage du tunnel a été annulé.");
        }
        this.#emitLog("Lien public temporaire confirmé.");
        return this.#setStatus({
          state: "online",
          available: true,
          url: publicUrl,
          message:
            "Le lien public temporaire est créé. Sa première résolution DNS peut prendre quelques secondes ; il reste actif tant que ce projet et Revaloop restent ouverts.",
        });
      } catch (error) {
        let terminated = true;
        if (child && child.exitCode === null && child.signalCode === null) {
          terminated = await terminateTunnel(
            child,
            this.#stopGraceMs,
            this.#stopKillMs,
          );
        }
        if (terminated && this.#child === child) this.#child = null;
        if (
          revision === this.#revision &&
          this.#status.state !== "unavailable"
        ) {
          this.#setStatus({
            state: "error",
            available: true,
            url: null,
            message:
              !terminated
                ? "Le processus cloudflared n’a pas confirmé son arrêt. Fermez Revaloop et vérifiez les processus du poste."
                : error instanceof Error
                ? error.message
                : "Le tunnel n’a pas pu démarrer.",
          });
        }
        throw error;
      }
    })();

    this.#pendingStart = request;
    void request.finally(() => {
      if (this.#pendingStart === request) this.#pendingStart = null;
    }).catch(() => undefined);
    return request;
  }

  stop(): Promise<TunnelStatus> {
    if (this.#pendingStop) return this.#pendingStop;
    this.#revision += 1;
    const request = (async () => {
      const child = this.#child;
      if (child) {
        this.#setStatus({
          state: "stopping",
          available: true,
          url: null,
          message: "Révocation du lien public temporaire…",
        });
        const terminated = await terminateTunnel(
          child,
          this.#stopGraceMs,
          this.#stopKillMs,
        );
        if (!terminated) {
          return this.#setStatus({
            state: "error",
            available: true,
            url: null,
            message:
              "Le processus cloudflared n’a pas confirmé son arrêt. Fermez Revaloop et vérifiez les processus du poste.",
          });
        }
        if (this.#child === child) this.#child = null;
        this.#emitLog("Lien public temporaire révoqué.");
      }
      if (this.#status.available === false) {
        return this.#setStatus({
          state: "unavailable",
          available: false,
          url: null,
          message:
            "cloudflared est absent. Installez-le vous-même puis relancez la vérification.",
        });
      }
      if (this.#status.available === null) {
        return this.#setStatus({ ...INITIAL_STATUS });
      }
      return this.#setStatus({
        state: "offline",
        available: true,
        url: null,
        message: "Aucun lien public n’est actif.",
      });
    })();
    this.#pendingStop = request;
    void request.finally(() => {
      if (this.#pendingStop === request) this.#pendingStop = null;
    }).catch(() => undefined);
    return request;
  }
}
