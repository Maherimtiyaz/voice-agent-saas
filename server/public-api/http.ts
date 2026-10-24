import "server-only";
import type { Database } from "@/db";
import { authenticateApiKey } from "@/server/services/api-key.service";
import { consumeRateLimit } from "@/server/services/rate-limit.service";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function apiError(message: string, status: number): Response {
  return Response.json(
    { error: { message } },
    {
      status,
      headers: {
        ...NO_STORE_HEADERS,
        ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="Voice Agent API"' } : {}),
      },
    },
  );
}

/**
 * A 429 response, with the standard `Retry-After` header so a client
 * knows when to come back.
 */
export function apiRateLimited(message: string, retryAfterSeconds: number): Response {
  return Response.json(
    { error: { message } },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function authorizePublicApiRequest(
  db: Database,
  request: Request,
): Promise<
  | { identity: { id: string; organizationId: string }; error?: never }
  | { identity?: never; error: Response }
> {
  const identity = await authenticateApiKey(db, request.headers.get("authorization"));
  if (!identity) {
    return {
      error: apiError("A valid workspace API key is required.", 401),
    };
  }

  // Rate limit per API key, not per organization: a workspace with
  // several keys gets the sum of them, which is the honest reading of
  // "this key made this many requests".
  const limit = await consumeRateLimit(db, {
    bucket: "public_api",
    key: identity.id,
  });

  if (!limit.allowed) {
    return {
      error: apiRateLimited(
        `Rate limit exceeded. Try again in ${limit.retryAfterSeconds} seconds.`,
        limit.retryAfterSeconds,
      ),
    };
  }

  return { identity };
}

export function apiSuccess(
  data: unknown,
  pagination?: { limit: number; offset: number; hasMore: boolean },
): Response {
  return Response.json(
    pagination ? { data, pagination } : { data },
    { headers: NO_STORE_HEADERS },
  );
}

export function parsePagination(searchParams: URLSearchParams):
  | { ok: true; limit: number; offset: number }
  | { ok: false; error: string } {
  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const offset = rawOffset === null ? 0 : Number(rawOffset);

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 1_000_000
  ) {
    return { ok: false, error: "Use limit 1-100 and offset 0-1000000." };
  }

  return { ok: true, limit, offset };
}
