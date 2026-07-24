import { getDemoWorkspace } from "../../../db/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await getDemoWorkspace();

    return Response.json(workspace, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Impossible de charger l’espace Revaloop", error);
    return Response.json(
      { error: "L’espace de démonstration est momentanément indisponible." },
      { status: 500 },
    );
  }
}
