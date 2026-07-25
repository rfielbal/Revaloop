import {
  consumeRateLimit,
  createRelease,
  repositoryErrorResponse,
} from "../../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../../lib/auth";
import {
  assertSameOrigin,
  cleanText,
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
      namespace: "release-create",
      identifier: identity.email,
      limit: 24,
      windowSeconds: 3_600,
    });

    const { id } = await context.params;
    const body = await readJsonObject(request);
    const version = cleanText(body.version, 40);
    const title = cleanText(body.title, 140);
    const testItems = Array.isArray(body.testItems)
      ? body.testItems
          .slice(0, 12)
          .map((item) => {
            const record =
              item && typeof item === "object"
                ? (item as Record<string, unknown>)
                : {};
            return {
              title: cleanText(record.title, 120),
              description: cleanText(record.description, 400),
            };
          })
          .filter((item) => item.title.length >= 3)
      : [];
    const expiresInDays = Math.min(
      30,
      Math.max(1, Number(body.expiresInDays) || 14),
    );

    if (!version || title.length < 3) {
      return Response.json(
        { error: "La version et son titre sont obligatoires." },
        { status: 400 },
      );
    }

    const result = await createRelease(identity, id, {
      version,
      title,
      commitSha: cleanText(body.commitSha, 80),
      previewUrl: normalizeExternalPreviewUrl(
        body.previewUrl,
        new URL(request.url).hostname === "localhost",
      ),
      reviewerMessage: cleanText(body.reviewerMessage, 1_200),
      testItems,
      expiresAt: new Date(
        Date.now() + expiresInDays * 86_400_000,
      ).toISOString(),
    });

    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de publier la release", error);
    return Response.json(
      { error: "La version n’a pas pu être publiée." },
      { status: 500 },
    );
  }
}
