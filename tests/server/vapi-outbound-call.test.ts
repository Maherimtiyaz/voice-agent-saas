import { afterEach, describe, expect, it, vi } from "vitest";
import { createOutboundCall } from "@/server/integrations/vapi/call";

describe("createOutboundCall", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("starts a single outbound call from the selected Vapi phone number", async () => {
    vi.stubEnv("VAPI_PRIVATE_API_KEY", "test-private-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "outbound-call-id" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createOutboundCall({
        vapiPhoneNumberId: "phone-number-id",
        assistantId: "assistant-id",
        customerNumber: "+14155551234",
      }),
    ).resolves.toEqual({ vapiCallId: "outbound-call-id" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.vapi.ai/call");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      phoneNumberId: "phone-number-id",
      assistantId: "assistant-id",
      customer: { number: "+14155551234" },
    });
  });

  it("surfaces a successful response without a call id as an error", async () => {
    vi.stubEnv("VAPI_PRIVATE_API_KEY", "test-private-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 201 })),
    );

    await expect(
      createOutboundCall({
        vapiPhoneNumberId: "phone-number-id",
        assistantId: "assistant-id",
        customerNumber: "+14155551234",
      }),
    ).rejects.toThrow("Vapi did not return an id for the outbound call.");
  });
});
