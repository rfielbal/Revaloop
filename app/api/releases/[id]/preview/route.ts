import {
  consumeRateLimit,
  incrementPreviewRevision,
  repositoryErrorResponse,
} from "../../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../../lib/auth";
import { isLoopbackRequestHostname } from "../../../../../lib/developer-auth-core";
import {
  assertSameOrigin,
  normalizeExternalPreviewUrl,
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
      namespace: "developer-preview-update",
      identifier: identity.email,
      limit: 30,
      windowSeconds: 300,
    });

    const { id: releaseId } = await context.params;
    const hasJsonBody = /^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    );
    const body = hasJsonBody ? await readJsonObject(request, 4_000) : {};
    const hasPreviewUrl = Object.prototype.hasOwnProperty.call(
      body,
      "previewUrl",
    );

    if (
      hasPreviewUrl &&
      (typeof body.previewUrl !== "string" || !body.previewUrl.trim())
    ) {
      return Response.json(
        { error: "La nouvelle URL de preview est obligatoire." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const previewUrl =
      hasPreviewUrl && typeof body.previewUrl === "string"
          ? normalizeExternalPreviewUrl(
              body.previewUrl,
              isLoopbackRequestHostname(new URL(request.url).hostname),
            )
        : undefined;
    const release = await incrementPreviewRevision(
      identity,
      releaseId,
      previewUrl,
    );

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
