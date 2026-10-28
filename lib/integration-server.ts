import { env } from "cloudflare:workers";
import { createIntegrationService } from "../db/integrations";
import {
  ensureDatabase,
  consumeRateLimit,
  repositoryErrorResponse,
} from "../db/repository";
import { IntegrationError } from "./integration-contract";
import { validationErrorResponse } from "./security";

export async function integrationService() {
  await ensureDatabase();
  return createIntegrationService(env.DB);
}
export async function authorizeIntegration(request: Request) {
  // These server-to-server routes never accept web cookies as credentials.
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new IntegrationError(
      403,
      "origin_denied",
      "Cette origine n’est pas autorisée.",
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer (rv[io]_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match)
    throw new IntegrationError(
      401,
      "invalid_token",
      "Un jeton d’intégration est requis.",
    );
  const service = await integrationService();
  const context = await service.authenticate(match[1]);
  await consumeRateLimit({
    namespace: "integration",
    identifier: context.id,
    limit: 300,
    windowSeconds: 60,
  });
  return { service, context };
}
export function integrationJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}
export function integrationErrorResponse(error: unknown) {
  if (error instanceof IntegrationError)
    return integrationJson(
      { error: error.message, code: error.code },
      error.status,
    );
  const existing =
    validationErrorResponse(error) ?? repositoryErrorResponse(error);
  if (existing) return existing;
  return integrationJson(
    {
      error: "L’intégration est momentanément indisponible.",
      code: "unavailable",
    },
    503,
  );
}
