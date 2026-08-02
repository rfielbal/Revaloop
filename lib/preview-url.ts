export const CONNECTED_PREVIEW_STORAGE_KEY =
  "revaloop:connected-preview-url";

export class PreviewUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewUrlError";
  }
}

function parseIpv4(hostname: string) {
  const parts = hostname.split(".");

  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part))
  ) {
    return null;
  }

  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function parseIpv6Words(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return null;

  const doubleColonParts = normalized.split("::");
  if (doubleColonParts.length > 2) return null;

  const parseSide = (side: string) => {
    if (!side) return [];
    const parts = side.split(":");
    const words: number[] = [];

    for (const [index, part] of parts.entries()) {
      const ipv4 = parseIpv4(part);
      if (ipv4) {
        if (index !== parts.length - 1) return null;
        words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      words.push(Number.parseInt(part, 16));
    }
    return words;
  };

  const left = parseSide(doubleColonParts[0]);
  const right = parseSide(doubleColonParts[1] ?? "");
  if (!left || !right) return null;

  if (doubleColonParts.length === 1) {
    return left.length === 8 ? left : null;
  }

  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function ipv4FromIpv6(words: number[]) {
  const isMapped =
    words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const isCompatible = words.slice(0, 6).every((word) => word === 0);
  if (!isMapped && !isCompatible) return null;

  return [
    words[6] >> 8,
    words[6] & 0xff,
    words[7] >> 8,
    words[7] & 0xff,
  ];
}

function isPrivateOrReservedIpv4(ipv4: number[]) {
  const [first, second] = ipv4;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateOrReservedHostname(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/g, "");

  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4 = parseIpv4(normalized);

  if (ipv4) {
    return isPrivateOrReservedIpv4(ipv4);
  }

  const ipv6 = parseIpv6Words(normalized);
  if (ipv6) {
    const embeddedIpv4 = ipv4FromIpv6(ipv6);
    if (embeddedIpv4 && isPrivateOrReservedIpv4(embeddedIpv4)) return true;

    return (
      ipv6.every((word) => word === 0) ||
      (ipv6.slice(0, 7).every((word) => word === 0) && ipv6[7] === 1) ||
      (ipv6[0] & 0xfe00) === 0xfc00 ||
      (ipv6[0] & 0xffc0) === 0xfe80
    );
  }

  return false;
}

export function normalizePreviewUrl(
  value: unknown,
  options: { allowLocal?: boolean } = {},
) {
  const raw = typeof value === "string" ? value.trim().slice(0, 2_048) : "";
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new PreviewUrlError("L’URL de preview n’est pas valide.");
  }

  const rawHostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const hasTrailingDot = /\.$/.test(rawHostname);
  const hostname = rawHostname.replace(/\.+$/g, "");
  const isLoopback =
    !hasTrailingDot &&
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1");

  if (url.username || url.password) {
    throw new PreviewUrlError(
      "L’URL de preview ne doit contenir aucun identifiant.",
    );
  }

  if (url.search) {
    throw new PreviewUrlError(
      "L’URL de preview ne doit contenir aucun paramètre. Utilisez une URL de staging dédiée.",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PreviewUrlError(
      "La preview doit utiliser HTTP ou HTTPS.",
    );
  }

  if (
    isPrivateOrReservedHostname(hostname) &&
    !(options.allowLocal && isLoopback)
  ) {
    throw new PreviewUrlError(
      "La preview doit utiliser une adresse publique, jamais une adresse locale ou privée.",
    );
  }

  if (url.protocol !== "https:" && !(options.allowLocal && isLoopback)) {
    throw new PreviewUrlError("La preview doit utiliser HTTPS.");
  }

  if (!url.hostname.includes(":") && url.hostname.replace(/\.+$/g, "") !== url.hostname) {
    url.hostname = hostname;
  }
  url.hash = "";
  return url.toString();
}

export function normalizeConnectedPreviewUrl(value: unknown) {
  return normalizePreviewUrl(value);
}
