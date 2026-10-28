import {
  authorizeIntegration,
  integrationErrorResponse,
  integrationJson,
} from "../../../../../lib/integration-server";
import { readJsonObject } from "../../../../../lib/security";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const { service, context } = await authorizeIntegration(request);
    const body = await readJsonObject(request);
    return integrationJson(
      await service.createProject(
        context,
        body as {
          requestId: string;
          expectedVersion: string;
          command: unknown;
        },
      ),
    );
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
