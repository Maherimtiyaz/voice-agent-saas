import * as z from "zod";
import { db } from "@/db";
import { apiError, apiSuccess, authorizePublicApiRequest } from "@/server/public-api/http";
import { getPublicCallDetail } from "@/server/services/public-api.service";

const callIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ callId: string }> },
) {
  const auth = await authorizePublicApiRequest(db, request);
  if (!auth.identity) return auth.error;

  const { callId } = await context.params;
  if (!callIdSchema.safeParse(callId).success) {
    return apiError("Call id must be a valid UUID.", 400);
  }

  const call = await getPublicCallDetail(db, {
    organizationId: auth.identity.organizationId,
    callId,
  });
  if (!call) return apiError("Call not found.", 404);

  return apiSuccess(call);
}
