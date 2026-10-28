import {
  authorizeIntegration,
  integrationJson,
  integrationErrorResponse,
} from "../../../../../lib/integration-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { service, context } = await authorizeIntegration(request);
    const identity = await service.capabilities(context);
    return integrationJson({ ...identity, projects: [identity.project] });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
