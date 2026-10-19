import { db } from "@/db";
import { apiSuccess, authorizePublicApiRequest } from "@/server/public-api/http";
import { listPublicAgents } from "@/server/services/public-api.service";

export async function GET(request: Request) {
  const auth = await authorizePublicApiRequest(db, request);
  if (!auth.identity) return auth.error;

  const agents = await listPublicAgents(db, auth.identity.organizationId);
  return apiSuccess(agents);
}
