import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../lib/auth";
import {
  provisionDeveloper,
  consumeRateLimit,
} from "../../../../db/repository";
import {
  integrationService,
  integrationJson,
  integrationErrorResponse,
} from "../../../../lib/integration-server";
import { IntegrationError } from "../../../../lib/integration-contract";
import {
  assertSameOrigin,
  readJsonObject,
  cleanText,
} from "../../../../lib/security";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const identity = await developerIdentityFromRequest(request);
  if (!identity) return unauthorizedResponse();
  try {
    const service = await integrationService();
    return integrationJson({
      tokens: await service.listTokens(
        await provisionDeveloper(identity),
        new URL(request.url).searchParams.get("project") ?? "",
      ),
    });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
export async function POST(request: Request) {
  const identity = await developerIdentityFromRequest(request);
  if (!identity) return unauthorizedResponse();
  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "integration-token-create",
      identifier: identity.email,
      limit: 20,
      windowSeconds: 3600,
    });
    const body = await readJsonObject(request);
    if (
      Object.keys(body).some(
        (key) =>
          !["projectId", "label", "write", "expiresInDays"].includes(key),
      ) ||
      typeof body.projectId !== "string" ||
      typeof body.label !== "string" ||
      body.label.length > 80 ||
      typeof body.write !== "boolean" ||
      typeof body.expiresInDays !== "number" ||
      !Number.isInteger(body.expiresInDays) ||
      body.expiresInDays < 1 ||
      body.expiresInDays > 90
    )
      throw new IntegrationError(
        400,
        "invalid_token_request",
        "Les paramètres de connexion sont invalides.",
      );
    const label = cleanText(body.label, 80);
    if (!label)
      throw new IntegrationError(
        400,
        "invalid_label",
        "Nommez cette connexion.",
      );
    const service = await integrationService();
    return integrationJson(
      await service.createToken(await provisionDeveloper(identity), {
        projectId: body.projectId,
        label,
        write: body.write,
        expiresInDays: body.expiresInDays,
      }),
      201,
    );
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
export async function DELETE(request: Request) {
  const identity = await developerIdentityFromRequest(request);
  if (!identity) return unauthorizedResponse();
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    if (
      Object.keys(body).some(
        (key) => !["projectId", "tokenId"].includes(key),
      ) ||
      typeof body.projectId !== "string" ||
      typeof body.tokenId !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/.test(body.tokenId)
    )
      throw new IntegrationError(
        400,
        "invalid_token_request",
        "Connexion invalide.",
      );
    const service = await integrationService();
    await service.revokeToken(
      await provisionDeveloper(identity),
      body.projectId,
      body.tokenId,
    );
    return integrationJson({ revoked: true });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
