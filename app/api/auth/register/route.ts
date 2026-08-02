import {
  consumeRateLimit,
  repositoryErrorResponse,
} from "../../../../db/repository";
import {
  canonicalRequestHostname,
  developerAuthErrorResponse,
  developerRegistrationRequestIsAuthorized,
  isLoopbackRequestHostname,
  registerDeveloper,
  serializeDeveloperSessionCookie,
  sitesAuthenticatedEmailFromHeaders,
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

function isLocalDevelopmentRequest(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return isLoopbackRequestHostname(
    canonicalRequestHostname(request.headers),
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);

    if (!(await developerRegistrationRequestIsAuthorized(request.headers))) {
      return Response.json(
        {
          error:
            "L’initialisation publique est verrouillée. Ouvrez cette page avec l’identité propriétaire Sites ou activez explicitement le bootstrap opérateur.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

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
      passwordConfirmation:
        typeof body.passwordConfirmation === "string"
          ? body.passwordConfirmation
          : "",
      sitesAuthenticatedEmail: sitesAuthenticatedEmailFromHeaders(
        request.headers,
      ),
      allowLocalPlaceholderRecovery: isLocalDevelopmentRequest(request),
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
