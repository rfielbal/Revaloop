import {
  consumeRateLimit,
  repositoryErrorResponse,
  updateFeedbackAsDeveloper,
} from "../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../lib/auth";
import type { FeedbackStatus } from "../../../../lib/revaloop";
import {
  assertSameOrigin,
  readJsonObject,
  validationErrorResponse,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const developerStatuses: FeedbackStatus[] = ["in_progress", "to_review"];

export async function PATCH(request: Request, context: RouteContext) {
  const identity = await developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "developer-feedback",
      identifier: identity.email,
      limit: 120,
      windowSeconds: 300,
    });
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const status = body.status as FeedbackStatus;

    if (!developerStatuses.includes(status)) {
      return Response.json(
        { error: "Transition développeur invalide." },
        { status: 400 },
      );
    }

    const item = await updateFeedbackAsDeveloper(identity, id, status);
    return Response.json(item, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de mettre à jour le retour", error);
    return Response.json(
      { error: "Le statut n’a pas pu être mis à jour." },
      { status: 500 },
    );
  }
}
