import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { googleCalendarIntegrations } from "@/db/schema";

const GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com";
const GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

export class GoogleCalendarError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

function getOAuthClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID;
  if (!value) throw new Error("GOOGLE_CLIENT_ID is not set.");
  return value;
}

function getOAuthClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("GOOGLE_CLIENT_SECRET is not set.");
  return value;
}

export function getGoogleCalendarRedirectUri(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set.");
  return `${appUrl.replace(/\/$/, "")}/api/calendar/google/callback`;
}

function getEncryptionKey(): Buffer {
  const encodedKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY is not set.");
  }
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptGoogleRefreshToken(refreshToken: string): string {
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

function decryptGoogleRefreshToken(encrypted: string): string {
  const [encodedIv, encodedTag, encodedCiphertext, extra] = encrypted.split(".");
  if (!encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error("Stored Google Calendar credentials are invalid.");
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

function oauthFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
}

async function readJsonResponse<T>(response: Response, requestDescription: string): Promise<T> {
  if (!response.ok) {
    throw new GoogleCalendarError(
      `Google Calendar ${requestDescription} failed with status ${response.status}.`,
      response.status,
    );
  }
  try {
    return await response.json() as T;
  } catch {
    throw new GoogleCalendarError(`Google Calendar ${requestDescription} returned invalid JSON.`);
  }
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  codeVerifier: string,
): Promise<GoogleTokenResponse> {
  const response = await oauthFetch(`${GOOGLE_OAUTH_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getOAuthClientId(),
      client_secret: getOAuthClientSecret(),
      redirect_uri: getGoogleCalendarRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const tokens = await readJsonResponse<GoogleTokenResponse>(response, "authorization-code exchange");
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in)) {
    throw new GoogleCalendarError("Google Calendar returned an incomplete token response.");
  }
  return tokens;
}

export async function saveGoogleCalendarConnection(
  db: Database,
  organizationId: string,
  refreshToken: string | undefined,
): Promise<void> {
  const [existing] = await db
    .select({ encryptedRefreshToken: googleCalendarIntegrations.encryptedRefreshToken })
    .from(googleCalendarIntegrations)
    .where(eq(googleCalendarIntegrations.organizationId, organizationId))
    .limit(1);

  const encryptedRefreshToken = refreshToken
    ? encryptGoogleRefreshToken(refreshToken)
    : existing?.encryptedRefreshToken;
  if (!encryptedRefreshToken) {
    throw new GoogleCalendarError(
      "Google did not provide a refresh token. Revoke this app's access in Google Account settings, then connect again.",
    );
  }

  await db
    .insert(googleCalendarIntegrations)
    .values({ organizationId, encryptedRefreshToken })
    .onConflictDoUpdate({
      target: googleCalendarIntegrations.organizationId,
      set: {
        encryptedRefreshToken,
        calendarId: "primary",
        updatedAt: new Date(),
      },
    });
}

async function getGoogleAccessToken(
  db: Database,
  organizationId: string,
): Promise<{ accessToken: string; calendarId: string }> {
  const [integration] = await db
    .select()
    .from(googleCalendarIntegrations)
    .where(eq(googleCalendarIntegrations.organizationId, organizationId))
    .limit(1);
  if (!integration) {
    throw new GoogleCalendarError("Connect a Google Calendar in workspace Settings before using calendar tools.");
  }

  const refreshToken = decryptGoogleRefreshToken(integration.encryptedRefreshToken);
  const response = await oauthFetch(`${GOOGLE_OAUTH_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getOAuthClientId(),
      client_secret: getOAuthClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokens = await readJsonResponse<GoogleTokenResponse>(response, "token refresh");
  if (!tokens.access_token) {
    throw new GoogleCalendarError("Google Calendar returned an incomplete token response.");
  }
  return { accessToken: tokens.access_token, calendarId: integration.calendarId };
}

export async function getGoogleCalendarBusyIntervals(
  db: Database,
  params: { organizationId: string; timeMin: Date; timeMax: Date },
): Promise<BusyInterval[]> {
  const { accessToken, calendarId } = await getGoogleAccessToken(db, params.organizationId);
  const response = await oauthFetch(`${GOOGLE_CALENDAR_API_URL}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: params.timeMin.toISOString(),
      timeMax: params.timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });
  const result = await readJsonResponse<{
    calendars?: Record<string, {
      busy?: Array<{ start: string; end: string }>;
      errors?: unknown[];
    }>;
  }>(response, "availability lookup");
  const calendar = result.calendars?.[calendarId];
  if (calendar?.errors?.length) {
    throw new GoogleCalendarError("Google Calendar could not read availability for the connected calendar.");
  }
  const busy = calendar?.busy;
  if (!Array.isArray(busy)) {
    throw new GoogleCalendarError("Google Calendar did not return availability for the connected calendar.");
  }

  return busy.map(({ start, end }) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      !Number.isFinite(startDate.getTime())
      || !Number.isFinite(endDate.getTime())
      || endDate <= startDate
    ) {
      throw new GoogleCalendarError("Google Calendar returned an invalid busy interval.");
    }
    return { start: startDate, end: endDate };
  });
}

export async function createGoogleCalendarEvent(
  db: Database,
  params: {
    organizationId: string;
    start: Date;
    durationMinutes: number;
    description?: string;
  },
): Promise<string> {
  const { accessToken, calendarId } = await getGoogleAccessToken(db, params.organizationId);
  const end = new Date(params.start.getTime() + params.durationMinutes * 60_000);
  const response = await oauthFetch(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: "Appointment",
        description: params.description,
        start: { dateTime: params.start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
      }),
    },
  );
  const event = await readJsonResponse<{ id?: string }>(response, "event creation");
  if (!event.id) {
    throw new GoogleCalendarError("Google Calendar created an event without returning its id.");
  }
  return event.id;
}

export async function deleteGoogleCalendarEvent(
  db: Database,
  params: { organizationId: string; eventId: string },
): Promise<void> {
  const { accessToken, calendarId } = await getGoogleAccessToken(db, params.organizationId);
  const response = await oauthFetch(
    `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new GoogleCalendarError(
      `Google Calendar event cleanup failed with status ${response.status}.`,
      response.status,
    );
  }
}
