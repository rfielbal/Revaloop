import { normalizePreviewUrl, PreviewUrlError } from "./preview-url";

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;|$)/i;

export class RequestValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.status = status;
  }
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, maxLength)
    : "";
}

export function normalizeReviewPath(value: unknown) {
  const raw = cleanText(value, 512);

  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(raw, "https://preview.invalid");
    return url.pathname.slice(0, 180) || "/";
  } catch {
    return (raw.split(/[?#]/, 1)[0] || "/").slice(0, 180);
  }
}

export function generateSecret(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function parseCookies(request: Request) {
  const result = new Map<string, string>();
  const raw = request.headers.get("cookie");

  if (!raw) {
    return result;
  }

  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    try {
      result.set(name, decodeURIComponent(value));
    } catch {
      result.set(name, value);
    }
  }

  return result;
}

export function reviewCookieName(releaseId: string) {
  const suffix = releaseId.replace(/[^a-zA-Z0-9]/g, "").slice(-20);
  const prefix = process.env.NODE_ENV === "production" ? "__Host-" : "";
  return `${prefix}revaloop_review_${suffix}`;
}

export function serializeReviewCookie(input: {
  releaseId: string;
  token: string;
  expiresAt: string;
  secure: boolean;
}) {
  const parts = [
    `${reviewCookieName(input.releaseId)}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Expires=${new Date(input.expiresAt).toUTCString()}`,
  ];

  if (input.secure || process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearReviewCookie(releaseId: string, secure: boolean) {
  const parts = [
    `${reviewCookieName(releaseId)}=`,
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

export async function readJsonObject(
  request: Request,
  maxBytes = 24_000,
): Promise<Record<string, unknown>> {
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    throw new RequestValidationError(
      "Le contenu doit être envoyé au format JSON.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestValidationError("Requête trop volumineuse.", 413);
  }

  const raw = await request.text();

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RequestValidationError("Requête trop volumineuse.", 413);
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new RequestValidationError("JSON invalide.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestValidationError("Objet JSON attendu.");
  }

  return value as Record<string, unknown>;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    throw new RequestValidationError("Origine de la requête absente.", 403);
  }

  const expectedOrigin = new URL(request.url).origin;

  if (origin !== expectedOrigin) {
    throw new RequestValidationError("Origine de la requête refusée.", 403);
  }
}

export function normalizeExternalPreviewUrl(
  value: unknown,
  allowLocal = false,
) {
  try {
    return normalizePreviewUrl(value, { allowLocal });
  } catch (error) {
    if (error instanceof PreviewUrlError) {
      throw new RequestValidationError(error.message);
    }

    throw error;
  }
}

export function validationErrorResponse(error: unknown) {
  if (!(error instanceof RequestValidationError)) {
    return null;
  }

  return Response.json(
    { error: error.message },
    {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
