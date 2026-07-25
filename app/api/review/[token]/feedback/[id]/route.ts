import {
  consumeRateLimit,
  repositoryErrorResponse,
  updateFeedbackAsReviewer,
} from "../../../../../../db/repository";
import type { FeedbackStatus } from "../../../../../../lib/revaloop";
import {
  assertSameOrigin,
  parseCookies,
  readJsonObject,
  reviewCookieName,
  validationErrorResponse,
} from "../../../../../../lib/security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ token: string; id: string }>;
};

const reviewerStatuses: FeedbackStatus[] = ["open", "resolved"];

export async function PATCH(request: Request, context: RouteContext) {
  const { token: releaseId, id } = await context.params;
  const secret =
    parseCookies(request).get(reviewCookieName(releaseId)) ?? "";

  if (!secret) {
    return Response.json(
      { error: "Session de recette requise." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "reviewer-feedback",
      identifier: `${releaseId}:${
        request.headers.get("cf-connecting-ip") ?? "unknown"
      }`,
      limit: 80,
      windowSeconds: 300,
    });
    const body = await readJsonObject(request);
    const status = body.status as FeedbackStatus;

    if (!reviewerStatuses.includes(status)) {
      return Response.json(
        { error: "Transition cliente invalide." },
        { status: 400 },
      );
    }

    const item = await updateFeedbackAsReviewer(
      releaseId,
      secret,
      id,
      status,
    );
    return Response.json(item, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de revalider le retour", error);
    return Response.json(
      { error: "Le retour n’a pas pu être revalidé." },
      { status: 500 },
    );
  }
}
