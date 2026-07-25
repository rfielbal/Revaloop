import {
  consumeRateLimit,
  repositoryErrorResponse,
} from "../../../../db/repository";
import {
  developerAuthErrorResponse,
  registerDeveloper,
  serializeDeveloperSessionCookie,
} from "../../../../lib/developer-auth";
import {
  assertSameOrigin,
  readJsonObject,
  validationErrorResponse,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

function clientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    "adresse-inconnue"
  ).slice(0, 128);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await consumeRateLimit({
      namespace: "developer-register-ip",
      identifier: clientAddress(request),
      limit: 5,
      windowSeconds: 3_600,
    });
    const body = await readJsonObject(request, 2_048);
    const session = await registerDeveloper({
      displayName:
        typeof body.displayName === "string" ? body.displayName : "",
      email: typeof body.email === "string" ? body.email : "",
      password: typeof body.password === "string" ? body.password : "",
    });
    const secure = new URL(request.url).protocol === "https:";

    return Response.json(
      { authenticated: true },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": serializeDeveloperSessionCookie({
            token: session.token,
            expiresAt: session.expiresAt,
            secure,
          }),
        },
      },
    );
  } catch (error) {
    const response =
      validationErrorResponse(error) ??
      developerAuthErrorResponse(error) ??
      repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible d’initialiser le compte développeur", error);
    return Response.json(
      { error: "Le compte n’a pas pu être créé pour le moment." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
