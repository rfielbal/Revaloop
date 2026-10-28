import {
  authorizeIntegration,
  integrationJson,
  integrationErrorResponse,
} from "../../../../../lib/integration-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { service, context } = await authorizeIntegration(request);
    return integrationJson(await service.capabilities(context));
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
