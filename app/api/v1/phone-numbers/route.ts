import { db } from "@/db";
import { apiSuccess, authorizePublicApiRequest } from "@/server/public-api/http";
import { listPublicPhoneNumbers } from "@/server/services/public-api.service";

export async function GET(request: Request) {
  const auth = await authorizePublicApiRequest(db, request);
  if (!auth.identity) return auth.error;

  const phoneNumbers = await listPublicPhoneNumbers(db, auth.identity.organizationId);
  return apiSuccess(phoneNumbers);
}
