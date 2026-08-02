import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const CURRENT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = join(CURRENT_DIRECTORY, "public");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_REVALOOP_ORIGIN =
  "https://revaloop-rfielbal.moulbyte.chatgpt.site";
const PILOT_VARIANTS = new Set(["initial", "corrected"]);
const APP_ROUTES = new Set(["/", "/commandes", "/clients"]);
const STATIC_FILES = new Map([
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
]);

function isLoopback(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  );
}

export function normalizeRevaloopOrigin(raw = DEFAULT_REVALOOP_ORIGIN) {
  let candidate;
  try {
    candidate = new URL(raw);
  } catch {
    throw new Error("REVALOOP_ORIGIN doit être une origine HTTP(S) valide.");
  }

  const isSecure = candidate.protocol === "https:";
  const isLocalDevelopment =
    candidate.protocol === "http:" && isLoopback(candidate.hostname);
  if (!isSecure && !isLocalDevelopment) {
    throw new Error(
      "REVALOOP_ORIGIN doit utiliser HTTPS, sauf pour une instance locale loopback.",
    );
  }
  if (
    candidate.username ||
    candidate.password ||
    candidate.search ||
    candidate.hash ||
    (candidate.pathname !== "/" && candidate.pathname !== "")
  ) {
    throw new Error(
      "REVALOOP_ORIGIN ne doit contenir ni chemin, ni identifiant, ni query, ni fragment.",
    );
  }
  return candidate.origin;
}

export function normalizePilotVariant(raw = "initial") {
  if (!PILOT_VARIANTS.has(raw)) {
    throw new Error("PILOT_VARIANT doit valoir « initial » ou « corrected ».");
  }
  return raw;
}

function normalizePort(raw = String(DEFAULT_PORT)) {
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT doit être un entier compris entre 1 et 65535.");
  }
  return port;
}

function securityHeaders(revaloopOrigin) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'none'",
      "connect-src 'none'",
      "font-src 'self'",
      "form-action 'self'",
      `frame-ancestors 'self' ${revaloopOrigin}`,
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join("; "),
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function writeResponse(response, status, headers, body, isHead = false) {
  response.writeHead(status, {
    ...headers,
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(isHead ? undefined : body);
}

function requestPath(request) {
  try {
    return new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    return null;
  }
}

export function createPilotServer({
  revaloopOrigin = process.env.REVALOOP_ORIGIN ?? DEFAULT_REVALOOP_ORIGIN,
  variant = process.env.PILOT_VARIANT ?? "initial",
} = {}) {
  const trustedParent = normalizeRevaloopOrigin(revaloopOrigin);
  const pilotVariant = normalizePilotVariant(variant);
  const commonHeaders = securityHeaders(trustedParent);

  return createServer(async (request, response) => {
    const method = request.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      writeResponse(
        response,
        405,
        { ...commonHeaders, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
        "Méthode non autorisée.\n",
      );
      return;
    }

    const path = requestPath(request);
    const isHead = method === "HEAD";
    if (path === "/health") {
      writeResponse(
        response,
        200,
        { ...commonHeaders, "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ status: "ok", fixture: "revaloop-pilot-preview" }),
        isHead,
      );
      return;
    }
    if (path === "/favicon.ico") {
      writeResponse(
        response,
        204,
        { ...commonHeaders, "Content-Type": "image/x-icon" },
        "",
        true,
      );
      return;
    }

    try {
      if (path && APP_ROUTES.has(path)) {
        const template = await readFile(join(PUBLIC_DIRECTORY, "index.html"), "utf8");
        const body = template
          .replaceAll("{{REVALOOP_ORIGIN}}", trustedParent)
          .replaceAll("{{PILOT_VARIANT}}", pilotVariant);
        writeResponse(
          response,
          200,
          { ...commonHeaders, "Content-Type": "text/html; charset=utf-8" },
          body,
          isHead,
        );
        return;
      }

      const asset = path ? STATIC_FILES.get(path) : undefined;
      if (asset) {
        const body = await readFile(join(PUBLIC_DIRECTORY, asset.file));
        writeResponse(
          response,
          200,
          { ...commonHeaders, "Content-Type": asset.type },
          body,
          isHead,
        );
        return;
      }

      writeResponse(
        response,
        404,
        { ...commonHeaders, "Content-Type": "text/plain; charset=utf-8" },
        "Page introuvable.\n",
        isHead,
      );
    } catch {
      writeResponse(
        response,
        500,
        { ...commonHeaders, "Content-Type": "text/plain; charset=utf-8" },
        "La preview pilote ne peut pas être chargée.\n",
        isHead,
      );
    }
  });
}

export async function startPilotServer({
  host = process.env.HOST || DEFAULT_HOST,
  port = normalizePort(process.env.PORT),
  revaloopOrigin = process.env.REVALOOP_ORIGIN ?? DEFAULT_REVALOOP_ORIGIN,
  variant = process.argv.includes("--corrected")
    ? "corrected"
    : process.env.PILOT_VARIANT ?? "initial",
} = {}) {
  const server = createPilotServer({ revaloopOrigin, variant });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    server,
    host,
    port,
    revaloopOrigin: normalizeRevaloopOrigin(revaloopOrigin),
    variant: normalizePilotVariant(variant),
  };
}

async function run() {
  try {
    const running = await startPilotServer();
    console.log(`Preview pilote prête : http://${running.host}:${running.port}`);
    console.log(`Contrôle de santé : http://${running.host}:${running.port}/health`);
    console.log(`Origine Revaloop autorisée : ${running.revaloopOrigin}`);
    console.log(`Variante : ${running.variant}`);
    console.log("Données : fictives, volatiles et réinitialisées au rechargement.");

    const stop = () => {
      running.server.close(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Impossible de démarrer la preview pilote : ${message}`);
    process.exitCode = 1;
  }
}

const executedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === executedFile) {
  await run();
}
