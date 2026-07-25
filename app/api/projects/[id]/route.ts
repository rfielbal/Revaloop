import {
  deleteProject,
  repositoryErrorResponse,
} from "../../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../../lib/auth";
import {
  assertSameOrigin,
  validationErrorResponse,
} from "../../../../lib/security";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const identity = await developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    await deleteProject(identity, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    const response =
      validationErrorResponse(error) ?? repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de supprimer le projet", error);
    return Response.json(
      { error: "Le projet n’a pas pu être supprimé." },
      { status: 500 },
    );
  }
}
