import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { organizations } from "@/db/schema";
import {
  createGoogleCalendarEvent,
  encryptGoogleRefreshToken,
  getGoogleCalendarBusyIntervals,
  saveGoogleCalendarConnection,
} from "@/server/integrations/google/calendar";
import {
  createGoogleOAuthRequest,
  verifyGoogleOAuthState,
} from "@/server/integrations/google/oauth";

let db: TestDatabase;
let organizationId: string;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("APP_URL", "https://voice.example.test");
  vi.stubEnv(
    "CALENDAR_TOKEN_ENCRYPTION_KEY",
    Buffer.alloc(32, 7).toString("base64"),
  );
  db = await createTestDatabase();
  const [organization] = await db
    .insert(organizations)
    .values({ name: "Calendar Test", slug: `calendar-${crypto.randomUUID()}` })
    .returning();
  organizationId = organization.id;
});

describe("Google Calendar integration", () => {
  it("encrypts refresh tokens before persisting them", async () => {
    await saveGoogleCalendarConnection(db, organizationId, "sensitive-refresh-token");
    const [stored] = await db.query.googleCalendarIntegrations.findMany({
      where: (table, { eq }) => eq(table.organizationId, organizationId),
    });

    expect(stored.encryptedRefreshToken).not.toBe("sensitive-refresh-token");
    expect(stored.encryptedRefreshToken.split(".")).toHaveLength(3);
    expect(encryptGoogleRefreshToken("sensitive-refresh-token")).not.toBe(
      stored.encryptedRefreshToken,
    );
  });

  it("binds OAuth state to the workspace and includes PKCE", async () => {
    const oauth = await createGoogleOAuthRequest({
      userId: "user-id",
      organizationId,
    });
    const authorizationUrl = new URL(oauth.authorizationUrl);
    const state = authorizationUrl.searchParams.get("state");
    const verified = await verifyGoogleOAuthState(state ?? "");
    const expectedChallenge = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(oauth.codeVerifier),
    );
    const challenge = Buffer.from(expectedChallenge).toString("base64url");

    expect(verified).toMatchObject({ userId: "user-id", organizationId, nonce: oauth.nonce });
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(challenge);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://voice.example.test/api/calendar/google/callback",
    );
  });

  it("uses Google FreeBusy results to return real busy intervals", async () => {
    await saveGoogleCalendarConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        calendars: {
          primary: {
            busy: [{ start: "2026-10-20T10:00:00Z", end: "2026-10-20T10:30:00Z" }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const busy = await getGoogleCalendarBusyIntervals(db, {
      organizationId,
      timeMin: new Date("2026-10-20T00:00:00Z"),
      timeMax: new Date("2026-10-21T00:00:00Z"),
    });

    expect(busy).toEqual([{
      start: new Date("2026-10-20T10:00:00Z"),
      end: new Date("2026-10-20T10:30:00Z"),
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const freeBusyRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(freeBusyRequest.items).toEqual([{ id: "primary" }]);
    expect(freeBusyRequest.timeMin).toBe("2026-10-20T00:00:00.000Z");
  });

  it("creates a Google Calendar event for an appointment", async () => {
    await saveGoogleCalendarConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ id: "event-123" }));
    vi.stubGlobal("fetch", fetchMock);

    const eventId = await createGoogleCalendarEvent(db, {
      organizationId,
      start: new Date("2026-10-20T15:00:00Z"),
      durationMinutes: 45,
      description: "Scheduled phone appointment",
    });

    expect(eventId).toBe("event-123");
    const eventRequest = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
    expect(eventRequest).toMatchObject({
      summary: "Appointment",
      description: "Scheduled phone appointment",
      start: { dateTime: "2026-10-20T15:00:00.000Z", timeZone: "UTC" },
      end: { dateTime: "2026-10-20T15:45:00.000Z", timeZone: "UTC" },
    });
  });

  it("fails rather than treating an unconnected workspace as free", async () => {
    await expect(getGoogleCalendarBusyIntervals(db, {
      organizationId,
      timeMin: new Date("2026-10-20T00:00:00Z"),
      timeMax: new Date("2026-10-21T00:00:00Z"),
    })).rejects.toThrow("Connect a Google Calendar");
  });

  it("fails closed when Google reports an error for the calendar", async () => {
    await saveGoogleCalendarConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        calendars: {
          primary: {
            busy: [],
            errors: [{ domain: "global", reason: "notFound" }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGoogleCalendarBusyIntervals(db, {
      organizationId,
      timeMin: new Date("2026-10-20T00:00:00Z"),
      timeMax: new Date("2026-10-21T00:00:00Z"),
    })).rejects.toThrow("could not read availability");
  });
});
