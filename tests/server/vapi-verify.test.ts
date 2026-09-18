import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.VAPI_WEBHOOK_SECRET = "test-vapi-secret";
});

describe("Vapi webhook secret verification", () => {
  it("accepts the correct shared secret", async () => {
    const { verifyVapiWebhookSecret } = await import("@/server/integrations/vapi/verify");
    expect(verifyVapiWebhookSecret("test-vapi-secret")).toBe(true);
  });

  it("rejects an incorrect secret", async () => {
    const { verifyVapiWebhookSecret } = await import("@/server/integrations/vapi/verify");
    expect(verifyVapiWebhookSecret("wrong-secret")).toBe(false);
  });

  it("rejects a missing header", async () => {
    const { verifyVapiWebhookSecret } = await import("@/server/integrations/vapi/verify");
    expect(verifyVapiWebhookSecret(null)).toBe(false);
  });

  it("rejects a secret of different length without throwing", async () => {
    const { verifyVapiWebhookSecret } = await import("@/server/integrations/vapi/verify");
    expect(verifyVapiWebhookSecret("short")).toBe(false);
  });
});
