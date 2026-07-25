import { readFile, stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

export const APP_SCHEME = "revaloop";
export const APP_HOST = "app";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export const DEVELOPMENT_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws://127.0.0.1:1420",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function response(
  body: BodyInit | null,
  status: number,
  contentType = "text/plain; charset=utf-8",
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "Cross-Origin-Opener-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function assetPathForUrl(
  rendererDirectory: string,
  rawUrl: string,
): string {
  const url = new URL(rawUrl);
  if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== APP_HOST) {
    throw new Error("Origine d’asset non autorisée.");
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new Error("Chemin d’asset invalide.");
  }
  const relativePath =
    pathname === "/" || pathname === "" ? "index.html" : pathname.slice(1);
  const candidate = resolve(rendererDirectory, relativePath);
  const escaped = relative(rendererDirectory, candidate);
  if (
    escaped === ".." ||
    escaped.startsWith(`..${sep}`) ||
    escaped.includes("\0")
  ) {
    throw new Error("Chemin d’asset non autorisé.");
  }
  return candidate;
}

export async function serveAsset(
  rendererDirectory: string,
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") return response(null, 405);
  let assetPath: string;
  try {
    assetPath = assetPathForUrl(rendererDirectory, request.url);
  } catch {
    return response(null, 404);
  }
  try {
    const metadata = await stat(assetPath);
    if (!metadata.isFile()) return response(null, 404);
    const bytes = await readFile(assetPath);
    return response(
      new Uint8Array(bytes),
      200,
      MIME_TYPES[extname(assetPath).toLowerCase()] ??
        "application/octet-stream",
    );
  } catch {
    return response(null, 404);
  }
}
