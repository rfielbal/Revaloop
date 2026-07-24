import { updateFeedbackStatus } from "../../../../db/repository";
import type { FeedbackStatus } from "../../../../lib/revaloop";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const statuses: FeedbackStatus[] = [
  "open",
  "in_progress",
  "to_review",
  "resolved",
];

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as { status?: FeedbackStatus };

    if (!body.status || !statuses.includes(body.status)) {
      return Response.json({ error: "Statut invalide." }, { status: 400 });
    }

    const item = await updateFeedbackStatus(id, body.status);

    if (!item) {
      return Response.json({ error: "Retour introuvable." }, { status: 404 });
    }

    return Response.json(item);
  } catch (error) {
    console.error("Impossible de mettre à jour le retour", error);
    return Response.json(
      { error: "Le statut n’a pas pu être mis à jour." },
      { status: 500 },
    );
  }
}
