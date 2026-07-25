import {
  consumeRateLimit,
  createProjectWithRelease,
  repositoryErrorResponse,
} from "../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../lib/auth";
import {
  assertSameOrigin,
  cleanText,
  normalizeExternalPreviewUrl,
  readJsonObject,
  validationErrorResponse,
} from "../../../lib/security";

export const dynamic = "force-dynamic";

function parseTestItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
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
    .filter((item) => item.title.length >= 3);
}

export async function POST(request: Request) {
  const identity = developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "project-create",
      identifier: identity.email,
      limit: 12,
      windowSeconds: 3_600,
    });

    const body = await readJsonObject(request);
    const name = cleanText(body.name, 100);
    const description = cleanText(body.description, 500);
    const version = cleanText(body.version, 40);
    const title = cleanText(body.title, 140);
    const commitSha = cleanText(body.commitSha, 80);
    const reviewerMessage = cleanText(body.reviewerMessage, 1_200);
    const testItems = parseTestItems(body.testItems);
    const previewUrl = normalizeExternalPreviewUrl(
      body.previewUrl,
      new URL(request.url).hostname === "localhost",
    );
    const expiresInDays = Math.min(
      30,
      Math.max(1, Number(body.expiresInDays) || 14),
    );

    if (name.length < 2 || version.length < 1 || title.length < 3) {
      return Response.json(
        {
          error:
            "Le projet, la version et le titre de release doivent être renseignés.",
        },
        { status: 400 },
      );
    }

    if (testItems.length === 0) {
      testItems.push({
        title: "Parcours principal",
        description:
          "Vérifiez que le parcours principal répond à votre besoin.",
      });
    }

    const result = await createProjectWithRelease(identity, {
      name,
      description,
      accent: "#ddebec",
      release: {
        version,
        title,
        commitSha,
        previewUrl,
        reviewerMessage,
        testItems,
        expiresAt: new Date(
          Date.now() + expiresInDays * 86_400_000,
        ).toISOString(),
      },
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

    console.error("Impossible de créer le projet", error);
    return Response.json(
      { error: "Le projet n’a pas pu être créé." },
      { status: 500 },
    );
  }
}
