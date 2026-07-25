import {
  clearDeveloperSessionCookie,
  revokeDeveloperRequestSession,
} from "../../../../lib/developer-auth";
import {
  assertSameOrigin,
  validationErrorResponse,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeDeveloperRequestSession(request);
    const secure = new URL(request.url).protocol === "https:";

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Clear-Site-Data": '"cache"',
        "Set-Cookie": clearDeveloperSessionCookie(secure),
      },
    });
  } catch (error) {
    const response = validationErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de fermer la session développeur", error);
    return Response.json(
      { error: "La déconnexion n’a pas pu être terminée." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
