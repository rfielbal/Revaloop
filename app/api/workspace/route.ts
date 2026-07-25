import { getDeveloperWorkspace } from "../../../db/repository";
import {
  developerIdentityFromRequest,
  unauthorizedResponse,
} from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await developerIdentityFromRequest(request);

  if (!identity) {
    return unauthorizedResponse();
  }

  try {
    const projectId = new URL(request.url).searchParams.get("project");
    const workspace = await getDeveloperWorkspace(identity, projectId);

    return Response.json(workspace, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
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
