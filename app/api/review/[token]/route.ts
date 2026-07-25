import {
  consumeRateLimit,
  createDecisionAsReviewer,
  createFeedbackAsReviewer,
  createReleaseMessageAsReviewer,
  getReviewForReviewer,
  repositoryErrorResponse,
  setTestItemCompletion,
} from "../../../../db/repository";
import type { ReviewDecision } from "../../../../lib/revaloop";
import {
  assertSameOrigin,
  cleanText,
  normalizeReviewPath,
  parseCookies,
  readJsonObject,
  reviewCookieName,
  validationErrorResponse,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string }>;
};

const decisionStatuses: ReviewDecision["status"][] = [
  "changes_requested",
  "approved",
];

function sessionToken(request: Request, releaseId: string) {
  return parseCookies(request).get(reviewCookieName(releaseId)) ?? "";
}

function clientRateIdentifier(request: Request, releaseId: string) {
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return `${releaseId}:${address}`;
}

export async function GET(request: Request, context: RouteContext) {
  const { token: releaseId } = await context.params;
  const secret = sessionToken(request, releaseId);

  if (!secret) {
    return Response.json(
      { error: "Session de recette requise." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const review = await getReviewForReviewer(releaseId, secret);

    if (!review) {
      return Response.json(
        { error: "Cette session est inconnue, expirée ou révoquée." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(review, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const response = repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de charger la recette", error);
    return Response.json(
      { error: "Cette recette est momentanément indisponible." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { token: releaseId } = await context.params;
  const secret = sessionToken(request, releaseId);

  if (!secret) {
    return Response.json(
      { error: "Session de recette requise." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "review-write",
      identifier: clientRateIdentifier(request, releaseId),
      limit: 40,
      windowSeconds: 300,
    });
    const body = await readJsonObject(request);

    if (body.kind === "message") {
      const message = cleanText(body.body, 2_000);

      if (message.length < 1) {
        return Response.json(
          { error: "Écrivez un message avant de l’envoyer." },
          { status: 400 },
        );
      }

      const created = await createReleaseMessageAsReviewer(
        releaseId,
        secret,
        message,
      );

      return Response.json(created, { status: 201 });
    }

    if (body.action === "feedback") {
      const title = cleanText(body.title, 120);
      const description = cleanText(body.body, 1_200);

      if (title.length < 3 || description.length < 3) {
        return Response.json(
          {
            error:
              "Le titre et le commentaire doivent contenir au moins 3 caractères.",
          },
          { status: 400 },
        );
      }

      const item = await createFeedbackAsReviewer(releaseId, secret, {
        type: "visual",
        title,
        body: description,
        priority: "normal",
        pagePath: normalizeReviewPath(body.pagePath),
        pageTitle: cleanText(body.pageTitle, 160),
        viewport: cleanText(body.viewport, 100) || "desktop",
        positionX:
          typeof body.positionX === "number"
            ? Math.round(Math.min(100, Math.max(0, body.positionX)) * 100) /
              100
            : null,
        positionY:
          typeof body.positionY === "number"
            ? Math.round(Math.min(100, Math.max(0, body.positionY)) * 100) /
              100
            : null,
      });

      return Response.json(item, { status: 201 });
    }

    if (body.action === "decision") {
      const status = body.status as ReviewDecision["status"];

      if (!decisionStatuses.includes(status)) {
        return Response.json({ error: "Décision invalide." }, { status: 400 });
      }

      const decision = await createDecisionAsReviewer(releaseId, secret, {
        status,
        note: cleanText(body.note, 800),
      });

      return Response.json(decision, { status: 201 });
    }

    if (body.action === "test_item") {
      const testItemId = cleanText(body.testItemId, 120);

      if (!testItemId || typeof body.completed !== "boolean") {
        return Response.json(
          { error: "Point de vérification invalide." },
          { status: 400 },
        );
      }

      const result = await setTestItemCompletion(
        releaseId,
        secret,
        testItemId,
        body.completed,
      );
      return Response.json(result);
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible d’enregistrer la recette", error);
    return Response.json(
      { error: "Le retour n’a pas pu être enregistré." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
