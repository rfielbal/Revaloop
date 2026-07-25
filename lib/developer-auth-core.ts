export const DEVELOPER_PASSWORD_MIN_LENGTH = 12;
export const DEVELOPER_PASSWORD_MAX_LENGTH = 128;
// Le runtime Web Crypto de Cloudflare Workers refuse actuellement les valeurs
// supérieures à 100 000. Garder cette constante alignée sur le runtime réel
// évite qu'une inscription valide en Node échoue une fois déployée.
export const DEVELOPER_PASSWORD_ITERATIONS = 100_000;
export const DEVELOPER_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;
export const SITES_AUTHENTICATED_EMAIL_HEADER =
  "oai-authenticated-user-email";
export const DEFAULT_REVALOOP_SITES_HOSTNAME =
  "revaloop-rfielbal.moulbyte.chatgpt.site";

export function trustedSitesHostname() {
  return (
    process.env.REVALOOP_TRUSTED_SITES_HOSTNAME?.trim().toLowerCase() ||
    DEFAULT_REVALOOP_SITES_HOSTNAME
  );
}

const LOCAL_COOKIE_NAME = "revaloop_developer";
const PRODUCTION_COOKIE_NAME = "__Host-revaloop_developer";
const DUMMY_SALT = "CMXcYL4RqpYJ7F3zwn9HNA";
const DUMMY_HASH = "DBqKx7LZ6EaO7JJ_YmD2P3WnHvpRdOXV8CoMfJZC0g8";

export class DeveloperAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "DeveloperAuthError";
    this.status = status;
  }
}

export function developerSessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_COOKIE_NAME
    : LOCAL_COOKIE_NAME;
}

export function normalizeDeveloperEmail(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const email = value.trim().toLowerCase().slice(0, 254);

  if (
    email.length < 3 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    /[\u0000-\u001f\u007f]/.test(email)
  ) {
    return "";
  }

  return email;
}

export function canonicalRequestHostname(headers: Pick<Headers, "get">) {
  const host = headers.get("host")?.trim().toLowerCase();

  if (!host || /[\s,/@\\?#]/.test(host)) {
    return "";
  }

  try {
    const parsed = new URL(`https://${host}`);

    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return "";
    }

    return parsed.hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isLoopbackRequestHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function sitesAuthenticatedEmailFromHeaders(
  headers: Pick<Headers, "get">,
) {
  if (canonicalRequestHostname(headers) !== trustedSitesHostname()) {
    return null;
  }

  return (
    normalizeDeveloperEmail(headers.get(SITES_AUTHENTICATED_EMAIL_HEADER)) ||
    null
  );
}

export function validateDeveloperPassword(value: unknown) {
  if (typeof value !== "string") {
    throw new DeveloperAuthError(
      `Le mot de passe doit contenir entre ${DEVELOPER_PASSWORD_MIN_LENGTH} et ${DEVELOPER_PASSWORD_MAX_LENGTH} caractères.`,
    );
  }

  const length = Array.from(value).length;

  if (
    length < DEVELOPER_PASSWORD_MIN_LENGTH ||
    length > DEVELOPER_PASSWORD_MAX_LENGTH
  ) {
    throw new DeveloperAuthError(
      `Le mot de passe doit contenir entre ${DEVELOPER_PASSWORD_MIN_LENGTH} et ${DEVELOPER_PASSWORD_MAX_LENGTH} caractères.`,
    );
  }

  return value;
}

export function validateDeveloperPasswordConfirmation(
  password: unknown,
  passwordConfirmation: unknown,
) {
  const validatedPassword = validateDeveloperPassword(password);

  if (
    typeof passwordConfirmation !== "string" ||
    validatedPassword !== passwordConfirmation
  ) {
    throw new DeveloperAuthError(
      "Les deux mots de passe ne correspondent pas.",
    );
  }

  return validatedPassword;
}

export function safeAuthReturnPath(
  value: string | null | undefined,
  fallback = "/dashboard",
) {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://revaloop.invalid");

    if (
      parsed.origin !== "https://revaloop.invalid" ||
      parsed.pathname === "/login" ||
      parsed.pathname === "/register" ||
      parsed.pathname === "/logout" ||
      parsed.pathname.startsWith("/api/")
    ) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function developerLoginPath(returnTo = "/dashboard") {
  return `/login?return_to=${encodeURIComponent(
    safeAuthReturnPath(returnTo),
  )}`;
}

export function developerLogoutPath(returnTo = "/") {
  return `/logout?return_to=${encodeURIComponent(
    safeAuthReturnPath(returnTo, "/"),
  )}`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveDeveloperPassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const normalizedSalt = new Uint8Array(salt.byteLength);
  normalizedSalt.set(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: normalizedSalt.buffer,
      iterations,
    },
    key,
    256,
  );

  return new Uint8Array(bits);
}

export async function hashDeveloperPassword(password: string) {
  validateDeveloperPassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveDeveloperPassword(
    password,
    salt,
    DEVELOPER_PASSWORD_ITERATIONS,
  );

  return {
    passwordHash: bytesToBase64Url(hash),
    passwordSalt: bytesToBase64Url(salt),
    passwordIterations: DEVELOPER_PASSWORD_ITERATIONS,
  };
}

export async function verifyDeveloperPassword(
  password: string,
  stored: {
    passwordHash: string;
    passwordSalt: string;
    passwordIterations: number;
  },
) {
  let expected: Uint8Array;
  let salt: Uint8Array;

  try {
    expected = base64UrlToBytes(stored.passwordHash);
    salt = base64UrlToBytes(stored.passwordSalt);
  } catch {
    return false;
  }

  if (
    expected.length !== 32 ||
    salt.length < 16 ||
    !Number.isInteger(stored.passwordIterations) ||
    stored.passwordIterations < 100_000 ||
    stored.passwordIterations > DEVELOPER_PASSWORD_ITERATIONS
  ) {
    return false;
  }

  const candidate = await deriveDeveloperPassword(
    password,
    salt,
    stored.passwordIterations,
  );
  let difference = candidate.length ^ expected.length;
  const comparisonLength = Math.max(candidate.length, expected.length);

  for (let index = 0; index < comparisonLength; index += 1) {
    difference |= (candidate[index] ?? 0) ^ (expected[index] ?? 0);
  }

  return difference === 0;
}

export async function performDummyDeveloperPasswordCheck(password: string) {
  await verifyDeveloperPassword(password, {
    passwordHash: DUMMY_HASH,
    passwordSalt: DUMMY_SALT,
    passwordIterations: DEVELOPER_PASSWORD_ITERATIONS,
  });
}

export function serializeDeveloperSessionCookie(input: {
  token: string;
  expiresAt: string;
  secure: boolean;
}) {
  const parts = [
    `${developerSessionCookieName()}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${new Date(input.expiresAt).toUTCString()}`,
    `Max-Age=${DEVELOPER_SESSION_DURATION_SECONDS}`,
  ];

  if (input.secure || process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearDeveloperSessionCookie(secure: boolean) {
  const parts = [
    `${developerSessionCookieName()}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];

  if (secure || process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}
