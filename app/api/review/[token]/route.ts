import {
  createDecision,
  createFeedback,
  getReviewByToken,
  ReviewConflictError,
  ReviewExpiredError,
} from "../../../../db/repository";
import type {
  FeedbackPriority,
  FeedbackType,
  ReviewDecision,
} from "../../../../lib/revaloop";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string }>;
};

const feedbackTypes: FeedbackType[] = ["visual", "functional", "copy"];
const priorities: FeedbackPriority[] = ["low", "normal", "high"];
const decisionStatuses: ReviewDecision["status"][] = [
  "changes_requested",
  "approved",
];

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function repositoryErrorResponse(error: unknown) {
  if (error instanceof ReviewExpiredError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (error instanceof ReviewConflictError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  try {
    const review = await getReviewByToken(token);

    if (!review) {
      return Response.json({ error: "Lien de recette introuvable." }, { status: 404 });
    }

    return Response.json(review, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const errorResponse = repositoryErrorResponse(error);

    if (errorResponse) {
      return errorResponse;
    }

    console.error("Impossible de charger la recette", error);
    return Response.json(
      { error: "Cette recette est momentanément indisponible." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;

  try {
    const review = await getReviewByToken(token);

    if (!review) {
      return Response.json({ error: "Lien de recette introuvable." }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (body.action === "feedback") {
      const type = feedbackTypes.includes(body.type as FeedbackType)
        ? (body.type as FeedbackType)
        : "visual";
      const priority = priorities.includes(body.priority as FeedbackPriority)
        ? (body.priority as FeedbackPriority)
        : "normal";
      const title = cleanText(body.title, 120);
      const description = cleanText(body.body, 1200);
      const authorName = cleanText(body.authorName, 80) || "Client invité";

      if (title.length < 3 || description.length < 3) {
        return Response.json(
          { error: "Le titre et le commentaire doivent contenir au moins 3 caractères." },
          { status: 400 },
        );
      }

      const item = await createFeedback({
        releaseId: review.release.id,
        type,
        title,
        body: description,
        priority,
        pagePath: cleanText(body.pagePath, 180) || "/",
        viewport: cleanText(body.viewport, 80) || "desktop",
        positionX:
          typeof body.positionX === "number"
            ? Math.round(Math.min(100, Math.max(0, body.positionX)))
            : null,
        positionY:
          typeof body.positionY === "number"
            ? Math.round(Math.min(100, Math.max(0, body.positionY)))
            : null,
        authorName,
      });

      return Response.json(item, { status: 201 });
    }

    if (body.action === "decision") {
      const status = body.status as ReviewDecision["status"];

      if (!decisionStatuses.includes(status)) {
        return Response.json({ error: "Décision invalide." }, { status: 400 });
      }

      const decision = await createDecision({
        releaseId: review.release.id,
        status,
        authorName: cleanText(body.authorName, 80) || "Client invité",
        note: cleanText(body.note, 800),
      });

      return Response.json(decision, { status: 201 });
    }

    return Response.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    const errorResponse = repositoryErrorResponse(error);

    if (errorResponse) {
      return errorResponse;
    }

    console.error("Impossible d’enregistrer la recette", error);
    return Response.json(
      { error: "Le retour n’a pas pu être enregistré." },
      { status: 500 },
    );
  }
}
