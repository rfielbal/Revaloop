import {
  repositoryErrorResponse,
  revokeReleaseAccess,
} from "../../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../../lib/auth";
import {
  assertSameOrigin,
  validationErrorResponse,
} from "../../../../../lib/security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const identity = developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    await revokeReleaseAccess(identity, id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de révoquer l’accès", error);
    return Response.json(
      { error: "L’accès n’a pas pu être révoqué." },
      { status: 500 },
    );
  }
}
