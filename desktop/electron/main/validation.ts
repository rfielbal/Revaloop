import { isIP } from "node:net";
import type {
  ExternalTarget,
  SettingsInput,
} from "../shared/contract.ts";

const MAX_URL_LENGTH = 2_048;
const MAX_SCRIPT_LENGTH = 1_024;
const LOOPBACK_V6 = "::1";
const EXTERNAL_TARGETS = new Set<ExternalTarget>([
  "preview",
  "dashboard",
  "login",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function isIpv4Loopback(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false;
  const firstOctet = Number.parseInt(hostname.split(".", 1)[0] ?? "", 10);
  return firstOctet === 127;
}

export function isLoopbackHostname(hostname: string): boolean {
  const candidate = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    candidate === "localhost" ||
    candidate === LOOPBACK_V6 ||
    isIpv4Loopback(candidate)
  );
}

function parseUrl(raw: unknown, label: string): URL {
  if (
    typeof raw !== "string" ||
    raw.trim().length === 0 ||
    raw.trim().length > MAX_URL_LENGTH
  ) {
    throw new Error(`${label} est vide ou trop longue.`);
  }
  try {
    return new URL(raw.trim());
  } catch {
    throw new Error(`${label} n’est pas une URL valide.`);
  }
}

function rejectUrlSecrets(url: URL, label: string): void {
  if (url.username || url.password) {
    throw new Error(`${label} ne doit contenir aucun identifiant.`);
  }
  if (url.search || url.hash) {
    throw new Error(
      `${label} ne doit contenir ni query string ni fragment.`,
    );
  }
}

export function normalizeLoopbackUrl(raw: unknown): URL {
  const url = parseUrl(raw, "L’adresse locale");
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("La preview locale doit utiliser HTTP ou HTTPS.");
  }
  rejectUrlSecrets(url, "Une URL de preview");

  const hostname = bareHostname(url);
  if (!isLoopbackHostname(hostname)) {
    throw new Error(
      "Seule une cible loopback explicite (127.0.0.1, localhost ou ::1) est autorisée.",
    );
  }
  if (hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }

  const port = url.port
    ? Number.parseInt(url.port, 10)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Le port de la preview est introuvable.");
  }
  return url;
}

export function normalizeControlPlaneUrl(raw: unknown): URL {
  const url = parseUrl(raw, "L’adresse de l’instance Revaloop");
  rejectUrlSecrets(url, "L’instance Revaloop");
  if (url.pathname !== "/") {
    throw new Error(
      "Indiquez uniquement l’origine de l’instance Revaloop, sans chemin.",
    );
  }

  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackHostname(bareHostname(url)))
  ) {
    throw new Error(
      "L’instance Revaloop doit utiliser HTTPS, ou HTTP en local.",
    );
  }
  return url;
}

export function parseSettingsInput(value: unknown): SettingsInput {
  if (!isRecord(value)) {
    throw new Error("La configuration locale est invalide.");
  }
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) => key !== "previewUrl" && key !== "controlPlaneUrl",
    ) ||
    keys.length !== 2
  ) {
    throw new Error("La configuration contient des champs non autorisés.");
  }
  return {
    previewUrl: normalizeLoopbackUrl(value.previewUrl).toString(),
    controlPlaneUrl: normalizeControlPlaneUrl(
      value.controlPlaneUrl,
    ).toString(),
  };
}

export function parseExpectedScript(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SCRIPT_LENGTH
  ) {
    throw new Error("Le script « dev » est vide ou trop long.");
  }
  return value;
}

export function parseExternalTarget(value: unknown): ExternalTarget {
  if (
    typeof value !== "string" ||
    !EXTERNAL_TARGETS.has(value as ExternalTarget)
  ) {
    throw new Error("Cette destination externe n’est pas autorisée.");
  }
  return value as ExternalTarget;
}

export function resolveRendererDevUrl(
  isPackaged: boolean,
  raw: unknown,
): string | null {
  if (isPackaged || raw === undefined || raw === null || raw === "") {
    return null;
  }
  if (typeof raw !== "string") {
    throw new Error("L’origine du renderer de développement est invalide.");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("L’origine du renderer de développement est invalide.");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "1420" ||
    url.pathname !== "/" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Le renderer de développement doit être exactement http://127.0.0.1:1420/.",
    );
  }
  return "http://127.0.0.1:1420/";
}

export function isTrustedRendererUrl(
  raw: string,
  rendererDevUrl: string | null,
): boolean {
  let candidate: URL;
  try {
    candidate = new URL(raw);
  } catch {
    return false;
  }
  if (rendererDevUrl) {
    return (
      candidate.protocol === "http:" &&
      candidate.hostname === "127.0.0.1" &&
      candidate.port === "1420" &&
      candidate.pathname === "/" &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.search === "" &&
      candidate.hash === ""
    );
  }
  return (
    candidate.protocol === "revaloop:" &&
    candidate.hostname === "app" &&
    candidate.pathname === "/" &&
    candidate.username === "" &&
    candidate.password === "" &&
    candidate.search === "" &&
    candidate.hash === ""
  );
}
