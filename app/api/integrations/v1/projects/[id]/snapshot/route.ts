import {
  authorizeIntegration,
  integrationJson,
  integrationErrorResponse,
} from "../../../../../../../lib/integration-server";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { service, context } = await authorizeIntegration(request);
    const { id } = await params;
    return integrationJson(await service.snapshot(context, id));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
