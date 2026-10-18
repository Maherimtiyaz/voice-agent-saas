import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../db-test-helper";
import { customers, hubspotIntegrations, organizations } from "@/db/schema";
import {
  createHubSpotDealIfConnected,
  exchangeHubSpotAuthorizationCode,
  saveHubSpotConnection,
  syncHubSpotContactIfConnected,
} from "@/server/integrations/hubspot/client";
import {
  createHubSpotAuthorization,
  verifyHubSpotOAuthState,
} from "@/server/integrations/hubspot/oauth";
import { findCustomerByPhone } from "@/server/services/customer.service";

let db: TestDatabase;
let organizationId: string;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  vi.stubEnv("HUBSPOT_CLIENT_ID", "test-client-id");
  vi.stubEnv("HUBSPOT_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("CRM_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("APP_URL", "https://voice.example.test");
  db = await createTestDatabase();
  const [organization] = await db
    .insert(organizations)
    .values({ name: "HubSpot Test", slug: `hubspot-${crypto.randomUUID()}` })
    .returning();
  organizationId = organization.id;
});

describe("HubSpot OAuth and CRM sync", () => {
  it("creates a signed OAuth state scoped to the workspace", async () => {
    const { authorizationUrl, nonce } = await createHubSpotAuthorization({
      userId: "user-id",
      organizationId,
    });
    const url = new URL(authorizationUrl);
    const state = url.searchParams.get("state");

    expect(await verifyHubSpotOAuthState(state ?? "")).toEqual({
      userId: "user-id",
      organizationId,
      nonce,
    });
    expect(url.origin + url.pathname).toBe("https://app.hubspot.com/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://voice.example.test/api/crm/hubspot/callback",
    );
    expect(url.searchParams.get("scope")).toContain("crm.objects.contacts.write");
    expect(url.searchParams.get("scope")).toContain("crm.objects.deals.write");
  });

  it("exchanges an OAuth code using HubSpot's form-encoded token endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 1800,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeHubSpotAuthorizationCode("authorization-code");

    expect(tokens.refresh_token).toBe("refresh-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [requestUrl, request] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe("https://api.hubapi.com/oauth/v1/token");
    expect(request.body.toString()).toContain("grant_type=authorization_code");
    expect(request.body.toString()).toContain("code=authorization-code");
  });

  it("encrypts refresh tokens at rest and stores one connection per workspace", async () => {
    await saveHubSpotConnection(db, organizationId, "private-refresh-token");
    await saveHubSpotConnection(db, organizationId, "replacement-refresh-token");
    const connections = await db
      .select()
      .from(hubspotIntegrations);

    expect(connections).toHaveLength(1);
    expect(connections[0].encryptedRefreshToken).not.toContain("replacement-refresh-token");
    expect(connections[0].encryptedRefreshToken.split(".")).toHaveLength(3);
  });

  it("searches by phone and creates a HubSpot contact when none exists", async () => {
    await saveHubSpotConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 1800 }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "contact-123" }));
    vi.stubGlobal("fetch", fetchMock);

    const [customer] = await db
      .insert(customers)
      .values({
        organizationId,
        name: "Sam Rivera",
        phone: "+14155550123",
        email: "sam@example.test",
      })
      .returning();
    const contactId = await syncHubSpotContactIfConnected(db, {
      organizationId,
      hubspotContactId: customer.hubspotContactId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    });

    expect(contactId).toBe("contact-123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string).filterGroups[0].filters[0])
      .toEqual({ propertyName: "phone", operator: "EQ", value: "+14155550123" });
    expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string).properties).toEqual({
      firstname: "Sam",
      lastname: "Rivera",
      phone: "+14155550123",
      email: "sam@example.test",
    });
  });

  it("updates an already linked HubSpot contact instead of duplicating it", async () => {
    await saveHubSpotConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 1800 }))
      .mockResolvedValueOnce(jsonResponse({ id: "contact-existing" }));
    vi.stubGlobal("fetch", fetchMock);

    const contactId = await syncHubSpotContactIfConnected(db, {
      organizationId,
      hubspotContactId: "contact-existing",
      name: "Sam Rivera",
      phone: "+14155550123",
      email: null,
    });

    expect(contactId).toBe("contact-existing");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("/crm/v3/objects/contacts/contact-existing");
  });

  it("hydrates a local customer when lookup finds a HubSpot-only contact", async () => {
    await saveHubSpotConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 1800 }))
      .mockResolvedValueOnce(jsonResponse({
        results: [{
          id: "contact-from-hubspot",
          properties: {
            firstname: "Taylor",
            lastname: "Chen",
            phone: "+14155550124",
            email: "taylor@example.test",
          },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const customer = await findCustomerByPhone(db, {
      organizationId,
      phone: "+14155550124",
    });

    expect(customer).toMatchObject({
      name: "Taylor Chen",
      phone: "+14155550124",
      email: "taylor@example.test",
      hubspotContactId: "contact-from-hubspot",
    });
  });

  it("creates an associated HubSpot deal using the first open default pipeline stage", async () => {
    await saveHubSpotConnection(db, organizationId, "refresh-token");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "access-token", expires_in: 1800 }))
      .mockResolvedValueOnce(jsonResponse({
        id: "default",
        stages: [
          { id: "closedwon", displayOrder: 0, metadata: { isClosed: "true" } },
          { id: "appointmentscheduled", displayOrder: 1, metadata: { isClosed: "false" } },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ id: "deal-123" }));
    vi.stubGlobal("fetch", fetchMock);

    const dealId = await createHubSpotDealIfConnected(db, {
      organizationId,
      contactId: "contact-123",
      jobId: "job-456",
      description: "Replace water heater",
    });

    expect(dealId).toBe("deal-123");
    const dealRequest = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
    expect(dealRequest.properties).toMatchObject({
      dealname: "Job: Replace water heater",
      pipeline: "default",
      dealstage: "appointmentscheduled",
    });
    expect(dealRequest.associations[0]).toMatchObject({
      to: { id: "contact-123" },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
    });
  });

  it("does not issue HubSpot requests for a workspace without a connection", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const contactId = await syncHubSpotContactIfConnected(db, {
      organizationId,
      hubspotContactId: null,
      name: "Sam Rivera",
      phone: "+14155550123",
      email: null,
    });

    expect(contactId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
