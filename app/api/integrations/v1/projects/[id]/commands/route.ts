import {
  authorizeIntegration,
  integrationJson,
  integrationErrorResponse,
} from "../../../../../../../lib/integration-server";
import { parseIntegrationCommand } from "../../../../../../../lib/integration-contract";
import { readJsonObject } from "../../../../../../../lib/security";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { service, context } = await authorizeIntegration(request);
    const { id } = await params;
    const input = parseIntegrationCommand(await readJsonObject(request));
    return integrationJson(await service.command(context, id, input));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
