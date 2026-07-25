import {
  getDeveloperWorkspace,
  repositoryErrorResponse,
} from "../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../lib/auth";

export const dynamic = "force-dynamic";

const resourceIdPattern = /^[A-Za-z0-9_-]{1,120}$/;

export async function GET(request: Request) {
  const identity = await developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const projectId = searchParams.get("project");
    const releaseId = searchParams.get("release");

    if (
      (projectId !== null && !resourceIdPattern.test(projectId)) ||
      (releaseId !== null && !resourceIdPattern.test(releaseId))
    ) {
      return Response.json(
        { error: "Le projet ou la version demandée est invalide." },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store, max-age=0" },
        },
      );
    }

    const workspace = await getDeveloperWorkspace(
      identity,
      projectId,
      releaseId,
    );

    return Response.json(workspace, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const response = repositoryErrorResponse(error);

    if (response) {
      return response;
    }

    console.error("Impossible de charger l’espace Revaloop", error);
    return Response.json(
      { error: "L’espace développeur est momentanément indisponible." },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}
