import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db";
import { apiKeys } from "@/db/schema";
import type { MemberRole } from "@/db/schema";
import { NotFoundError } from "@/server/errors";
import { requireMembership } from "@/server/services/organization.service";

const API_KEY_PREFIX = "va_live_";

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreatedApiKey {
  key: ApiKeySummary;
  token: string;
}

export interface ApiKeyIdentity {
  id: string;
  organizationId: string;
}

function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listApiKeys(
  db: Database,
  params: { organizationId: string; userId: string; allowedRoles?: MemberRole[] },
): Promise<ApiKeySummary[]> {
  await requireMembership(db, {
    organizationId: params.organizationId,
    userId: params.userId,
    allowedRoles: params.allowedRoles ?? ["owner", "admin"],
  });

  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, params.organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function createApiKey(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    name: string;
  },
): Promise<CreatedApiKey> {
  await requireMembership(db, {
    organizationId: params.organizationId,
    userId: params.userId,
    allowedRoles: ["owner", "admin"],
  });

  const token = `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const keyPrefix = token.slice(0, API_KEY_PREFIX.length + 8);
  const [key] = await db
    .insert(apiKeys)
    .values({
      organizationId: params.organizationId,
      createdByUserId: params.userId,
      name: params.name,
      keyPrefix,
      keyHash: hashApiKey(token),
    })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    });

  return { key, token };
}

export async function revokeApiKey(
  db: Database,
  params: {
    organizationId: string;
    userId: string;
    apiKeyId: string;
  },
): Promise<void> {
  await requireMembership(db, {
    organizationId: params.organizationId,
    userId: params.userId,
    allowedRoles: ["owner", "admin"],
  });

  const [revoked] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, params.apiKeyId),
        eq(apiKeys.organizationId, params.organizationId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });

  if (revoked) return;

  const [existing] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.id, params.apiKeyId),
        eq(apiKeys.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!existing) throw new NotFoundError("API key");
}

export async function authenticateApiKey(
  db: Database,
  authorizationHeader: string | null,
): Promise<ApiKeyIdentity | null> {
  const match = authorizationHeader?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const [, token] = match;
  if (!token.startsWith(API_KEY_PREFIX)) return null;

  const [key] = await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.keyHash, hashApiKey(token)), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, organizationId: apiKeys.organizationId });
  if (!key) return null;

  return key;
}
