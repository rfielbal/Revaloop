import {
  consumeRateLimit,
  incrementPreviewRevision,
  repositoryErrorResponse,
} from "../../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../../lib/auth";
import {
  assertSameOrigin,
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
      namespace: "developer-preview-update",
      identifier: identity.email,
      limit: 30,
      windowSeconds: 300,
    });

    const { id: releaseId } = await context.params;
    const release = await incrementPreviewRevision(identity, releaseId);

    return Response.json(release, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de signaler la mise à jour de la preview", error);
    return Response.json(
      { error: "La mise à jour n’a pas pu être signalée au client." },
      { status: 500 },
    );
  }
}
