import { db } from "@/db";
import {
  apiError,
  apiSuccess,
  authorizePublicApiRequest,
  parsePagination,
} from "@/server/public-api/http";
import { listPublicCalls } from "@/server/services/public-api.service";

export async function GET(request: Request) {
  const auth = await authorizePublicApiRequest(db, request);
  if (!auth.identity) return auth.error;

  const pagination = parsePagination(new URL(request.url).searchParams);
  if (!pagination.ok) return apiError(pagination.error, 400);

  const page = await listPublicCalls(db, {
    organizationId: auth.identity.organizationId,
    limit: pagination.limit,
    offset: pagination.offset,
  });
  return apiSuccess(page.data, {
    limit: pagination.limit,
    offset: pagination.offset,
    hasMore: page.hasMore,
  });
}
