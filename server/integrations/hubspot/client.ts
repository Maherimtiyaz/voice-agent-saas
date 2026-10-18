import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { hubspotIntegrations } from "@/db/schema";

const HUBSPOT_API_URL = "https://api.hubapi.com";
const HUBSPOT_OAUTH_URL = `${HUBSPOT_API_URL}/oauth/v1/token`;

interface HubSpotTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

interface HubSpotContact {
  id: string;
  properties?: Record<string, string | null>;
}

interface HubSpotDeal {
  id: string;
}

interface HubSpotPipeline {
  id: string;
  stages: Array<{
    id: string;
    displayOrder: number;
    metadata: { isClosed?: string | boolean };
  }>;
}

export class HubSpotApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "HubSpotApiError";
  }
}

function getOAuthClientId(): string {
  const value = process.env.HUBSPOT_CLIENT_ID;
  if (!value) throw new Error("HUBSPOT_CLIENT_ID is not set.");
  return value;
}

function getOAuthClientSecret(): string {
  const value = process.env.HUBSPOT_CLIENT_SECRET;
  if (!value) throw new Error("HUBSPOT_CLIENT_SECRET is not set.");
  return value;
}

export function getHubSpotRedirectUri(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set.");
  return `${appUrl.replace(/\/$/, "")}/api/crm/hubspot/callback`;
}

function getEncryptionKey(): Buffer {
  const encodedKey = process.env.CRM_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("CRM_TOKEN_ENCRYPTION_KEY is not set.");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("CRM_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function encryptRefreshToken(refreshToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptRefreshToken(encrypted: string): string {
  const [encodedIv, encodedTag, encodedCiphertext, extra] = encrypted.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error("Stored HubSpot credentials are invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function oauthRequest(
  body: URLSearchParams,
): Promise<HubSpotTokenResponse> {
  const response = await fetch(HUBSPOT_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new HubSpotApiError(
      `HubSpot OAuth request failed with status ${response.status}.`,
      response.status,
    );
  }
  let tokenResponse: HubSpotTokenResponse;
  try {
    tokenResponse = await response.json() as HubSpotTokenResponse;
  } catch {
    throw new HubSpotApiError("HubSpot OAuth returned invalid JSON.");
  }
  if (!tokenResponse.access_token || !Number.isFinite(tokenResponse.expires_in)) {
    throw new HubSpotApiError("HubSpot OAuth returned an incomplete token response.");
  }
  return tokenResponse;
}

export async function exchangeHubSpotAuthorizationCode(code: string): Promise<HubSpotTokenResponse> {
  const tokens = await oauthRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getOAuthClientId(),
    client_secret: getOAuthClientSecret(),
    redirect_uri: getHubSpotRedirectUri(),
    code,
  }));
  if (!tokens.refresh_token) {
    throw new HubSpotApiError("HubSpot OAuth did not return a refresh token.");
  }
  return tokens;
}

export async function saveHubSpotConnection(
  db: Database,
  organizationId: string,
  refreshToken: string,
): Promise<void> {
  await db
    .insert(hubspotIntegrations)
    .values({
      organizationId,
      encryptedRefreshToken: encryptRefreshToken(refreshToken),
    })
    .onConflictDoUpdate({
      target: hubspotIntegrations.organizationId,
      set: {
        encryptedRefreshToken: encryptRefreshToken(refreshToken),
        updatedAt: new Date(),
      },
    });
}

export async function getHubSpotConnectionStatus(
  db: Database,
  organizationId: string,
): Promise<{ connectedAt: Date } | null> {
  const [connection] = await db
    .select({ connectedAt: hubspotIntegrations.connectedAt })
    .from(hubspotIntegrations)
    .where(eq(hubspotIntegrations.organizationId, organizationId))
    .limit(1);
  return connection ?? null;
}

async function getAccessToken(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const [integration] = await db
    .select()
    .from(hubspotIntegrations)
    .where(eq(hubspotIntegrations.organizationId, organizationId))
    .limit(1);
  if (!integration) return null;

  const refreshToken = decryptRefreshToken(integration.encryptedRefreshToken);
  const tokens = await oauthRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getOAuthClientId(),
    client_secret: getOAuthClientSecret(),
    redirect_uri: getHubSpotRedirectUri(),
    refresh_token: refreshToken,
  }));
  if (tokens.refresh_token) {
    await db
      .update(hubspotIntegrations)
      .set({
        encryptedRefreshToken: encryptRefreshToken(tokens.refresh_token),
        updatedAt: new Date(),
      })
      .where(eq(hubspotIntegrations.id, integration.id));
  }
  return tokens.access_token;
}

async function hubspotRequest<T>(
  accessToken: string,
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<T> {
  const response = await fetch(`${HUBSPOT_API_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new HubSpotApiError(
      `HubSpot CRM request failed with status ${response.status}.`,
      response.status,
    );
  }
  try {
    return await response.json() as T;
  } catch {
    throw new HubSpotApiError("HubSpot CRM returned invalid JSON.");
  }
}

function contactProperties(contact: {
  name: string;
  phone: string;
  email: string | null;
}): Record<string, string> {
  const [firstName, ...lastNameParts] = contact.name.trim().split(/\s+/);
  const properties: Record<string, string> = {
    firstname: firstName,
    lastname: lastNameParts.join(" "),
    phone: contact.phone,
  };
  if (contact.email) properties.email = contact.email;
  return properties;
}

function requireRecordId(value: { id?: string }, description: string): string {
  if (!value.id) {
    throw new HubSpotApiError(`HubSpot ${description} response did not include a record id.`);
  }
  return value.id;
}

async function findHubSpotContactByPhone(
  accessToken: string,
  phone: string,
): Promise<HubSpotContact | null> {
  const response = await hubspotRequest<{ results?: HubSpotContact[] }>(
    accessToken,
    "/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: {
        filterGroups: [{
          filters: [{ propertyName: "phone", operator: "EQ", value: phone }],
        }],
        properties: ["firstname", "lastname", "phone", "email"],
        limit: 1,
      },
    },
  );
  if (!Array.isArray(response.results)) {
    throw new HubSpotApiError("HubSpot contact search returned an invalid response.");
  }
  const contact = response.results[0];
  return contact ? { ...contact, id: requireRecordId(contact, "contact search") } : null;
}

export async function findHubSpotContactByPhoneIfConnected(
  db: Database,
  params: { organizationId: string; phone: string },
): Promise<HubSpotContact | null> {
  const accessToken = await getAccessToken(db, params.organizationId);
  if (!accessToken) return null;
  return findHubSpotContactByPhone(accessToken, params.phone);
}

export async function syncHubSpotContactIfConnected(
  db: Database,
  params: {
    organizationId: string;
    hubspotContactId: string | null;
    name: string;
    phone: string;
    email: string | null;
  },
): Promise<string | null> {
  const accessToken = await getAccessToken(db, params.organizationId);
  if (!accessToken) return null;

  const properties = contactProperties(params);
  if (params.hubspotContactId) {
    try {
      const result = await hubspotRequest<HubSpotContact>(
        accessToken,
        `/crm/v3/objects/contacts/${encodeURIComponent(params.hubspotContactId)}`,
        { method: "PATCH", body: { properties } },
      );
      return requireRecordId(result, "contact update");
    } catch (error) {
      if (!(error instanceof HubSpotApiError) || error.status !== 404) throw error;
    }
  }

  const existing = await findHubSpotContactByPhone(accessToken, params.phone);
  if (existing) {
    const result = await hubspotRequest<HubSpotContact>(
      accessToken,
      `/crm/v3/objects/contacts/${encodeURIComponent(existing.id)}`,
      { method: "PATCH", body: { properties } },
    );
    return requireRecordId(result, "contact update");
  }

  try {
    const result = await hubspotRequest<HubSpotContact>(
      accessToken,
      "/crm/v3/objects/contacts",
      { method: "POST", body: { properties } },
    );
    return requireRecordId(result, "contact creation");
  } catch (error) {
    if (!(error instanceof HubSpotApiError) || error.status !== 409) throw error;
    const conflict = await findHubSpotContactByPhone(accessToken, params.phone);
    if (!conflict) throw error;
    const result = await hubspotRequest<HubSpotContact>(
      accessToken,
      `/crm/v3/objects/contacts/${encodeURIComponent(conflict.id)}`,
      { method: "PATCH", body: { properties } },
    );
    return requireRecordId(result, "contact update");
  }
}

async function getDefaultDealPipeline(
  accessToken: string,
): Promise<{ pipelineId: string; stageId: string }> {
  const pipeline = await hubspotRequest<HubSpotPipeline>(
    accessToken,
    "/crm/v3/pipelines/deals/default",
    { method: "GET" },
  );
  if (!pipeline.id || !Array.isArray(pipeline.stages)) {
    throw new HubSpotApiError("HubSpot returned an invalid default deal pipeline.");
  }
  const firstOpenStage = pipeline.stages
    .filter((stage) => stage.metadata?.isClosed === false || stage.metadata?.isClosed === "false")
    .sort((left, right) => left.displayOrder - right.displayOrder)[0];
  if (!firstOpenStage) {
    throw new HubSpotApiError("HubSpot's default deal pipeline has no open stages.");
  }
  return { pipelineId: pipeline.id, stageId: firstOpenStage.id };
}

export async function createHubSpotDealIfConnected(
  db: Database,
  params: {
    organizationId: string;
    contactId: string;
    jobId: string;
    description: string;
  },
): Promise<string | null> {
  const accessToken = await getAccessToken(db, params.organizationId);
  if (!accessToken) return null;

  const { pipelineId, stageId } = await getDefaultDealPipeline(accessToken);
  const result = await hubspotRequest<HubSpotDeal>(
    accessToken,
    "/crm/v3/objects/deals",
    {
      method: "POST",
      body: {
        properties: {
          dealname: `Job: ${params.description}`.slice(0, 255),
          description: `Voice agent work order ${params.jobId}\n${params.description}`,
          pipeline: pipelineId,
          dealstage: stageId,
        },
        associations: [{
          to: { id: params.contactId },
          types: [{
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 3,
          }],
        }],
      },
    },
  );
  return requireRecordId(result, "deal creation");
}
