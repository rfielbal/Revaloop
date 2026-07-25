import {
  consumeRateLimit,
  createReleaseMessageAsDeveloper,
  repositoryErrorResponse,
} from "../../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../../lib/auth";
import {
  assertSameOrigin,
  cleanText,
  readJsonObject,
  validationErrorResponse,
} from "../../../../../lib/security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const identity = await developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "developer-message",
      identifier: identity.email,
      limit: 80,
      windowSeconds: 300,
    });

    const { id: releaseId } = await context.params;
    const payload = await readJsonObject(request);
    const body = cleanText(payload.body, 2_000);

    if (!body) {
      return Response.json(
        { error: "Écrivez un message avant de l’envoyer." },
        { status: 400 },
      );
    }

    const message = await createReleaseMessageAsDeveloper(
      identity,
      releaseId,
      body,
    );

    return Response.json(message, {
      status: 201,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible d’envoyer le message développeur", error);
    return Response.json(
      { error: "Le message n’a pas pu être envoyé." },
      { status: 500 },
    );
  }
}
