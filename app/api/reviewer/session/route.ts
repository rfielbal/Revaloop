import {
  consumeRateLimit,
  exchangeInvitation,
  repositoryErrorResponse,
  revokeReviewerSession,
} from "../../../../db/repository";
import {
  assertSameOrigin,
  clearReviewCookie,
  cleanText,
  parseCookies,
  readJsonObject,
  reviewCookieName,
  serializeReviewCookie,
  validationErrorResponse,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request, 4_000);
    const secret = cleanText(body.secret, 200);
    const clientAddress =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    await consumeRateLimit({
      namespace: "invitation-exchange",
      identifier: clientAddress,
      limit: 12,
      windowSeconds: 300,
    });

    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
      return Response.json(
        { error: "Cette invitation n’est pas valide." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const session = await exchangeInvitation(secret);

    if (!session) {
      return Response.json(
        {
          error:
            "Cette invitation est inconnue, expirée, révoquée ou déjà utilisée.",
        },
        { status: 410, headers: { "Cache-Control": "no-store" } },
      );
    }

    const response = Response.json(
      {
        redirectTo: `/review/${session.releaseId}`,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
    response.headers.append(
      "Set-Cookie",
      serializeReviewCookie({
        releaseId: session.releaseId,
        token: session.sessionToken,
        expiresAt: session.expiresAt,
        secure: new URL(request.url).protocol === "https:",
      }),
    );

    return response;
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible d’échanger l’invitation", error);
    return Response.json(
      { error: "L’invitation ne peut pas être ouverte pour le moment." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request, 2_000);
    const releaseId = cleanText(body.releaseId, 120);
    const token =
      parseCookies(request).get(reviewCookieName(releaseId)) ?? "";

    if (releaseId && token) {
      await revokeReviewerSession(releaseId, token);
    }

    const response = new Response(null, { status: 204 });

    response.headers.append(
      "Set-Cookie",
      clearReviewCookie(
        releaseId,
        new URL(request.url).protocol === "https:",
      ),
    );
    return response;
  } catch (error) {
    return (
      validationErrorResponse(error) ??
      repositoryErrorResponse(error) ??
      Response.json({ error: "Déconnexion impossible." }, { status: 400 })
    );
  }
}
