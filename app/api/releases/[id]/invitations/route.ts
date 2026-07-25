import {
  consumeRateLimit,
  createInvitation,
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
  const identity = developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "invitation-create",
      identifier: identity.email,
      limit: 30,
      windowSeconds: 3_600,
    });

    const { id } = await context.params;
    const body = await readJsonObject(request);
    const reviewerName = cleanText(body.reviewerName, 100);
    const reviewerEmail = cleanText(body.reviewerEmail, 254).toLowerCase();
    const expiresInDays = Math.min(
      30,
      Math.max(1, Number(body.expiresInDays) || 7),
    );

    if (reviewerName.length < 2) {
      return Response.json(
        { error: "Le prénom ou le nom de la cliente est obligatoire." },
        { status: 400 },
      );
    }

    if (
      reviewerEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reviewerEmail)
    ) {
      return Response.json(
        { error: "L’adresse e-mail de la cliente n’est pas valide." },
        { status: 400 },
      );
    }

    const invitation = await createInvitation(identity, {
      releaseId: id,
      reviewerName,
      reviewerEmail: reviewerEmail || null,
      expiresAt: new Date(
        Date.now() + expiresInDays * 86_400_000,
      ).toISOString(),
    });
    const requestUrl = new URL(request.url);
    const inviteUrl = `${requestUrl.origin}/join#token=${invitation.secret}`;

    return Response.json(
      {
        invitationId: invitation.invitationId,
        releaseId: invitation.releaseId,
        inviteUrl,
        expiresAt: invitation.expiresAt,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de créer l’invitation", error);
    return Response.json(
      { error: "L’invitation n’a pas pu être créée." },
      { status: 500 },
    );
  }
}
