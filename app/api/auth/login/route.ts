import {
  consumeRateLimit,
  repositoryErrorResponse,
} from "../../../../db/repository";
import {
  developerAuthErrorResponse,
  loginDeveloper,
  normalizeDeveloperEmail,
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
    const body = await readJsonObject(request, 2_048);
    const email = normalizeDeveloperEmail(body.email);

    await Promise.all([
      consumeRateLimit({
        namespace: "developer-login-ip",
        identifier: clientAddress(request),
        limit: 12,
        windowSeconds: 900,
      }),
      consumeRateLimit({
        namespace: "developer-login-account",
        identifier: email || "adresse-invalide",
        limit: 10,
        windowSeconds: 900,
      }),
    ]);

    const session = await loginDeveloper({
      email,
      password: typeof body.password === "string" ? body.password : "",
    });
    const secure = new URL(request.url).protocol === "https:";

    return Response.json(
      { authenticated: true },
      {
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

    console.error("Impossible d’ouvrir la session développeur", error);
    return Response.json(
      { error: "La connexion est momentanément indisponible." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
