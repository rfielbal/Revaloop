export const DEVELOPER_PASSWORD_MIN_LENGTH = 12;
export const DEVELOPER_PASSWORD_MAX_LENGTH = 128;
export const DEVELOPER_PASSWORD_ITERATIONS = 600_000;
export const DEVELOPER_SESSION_DURATION_SECONDS = 30 * 24 * 60 * 60;

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
    stored.passwordIterations > 2_000_000
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
