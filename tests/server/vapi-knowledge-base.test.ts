import { afterEach, describe, expect, it, vi } from "vitest";
import {
  syncVapiKnowledgeTool,
  uploadVapiKnowledgeFile,
} from "@/server/integrations/vapi/knowledge-base";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Vapi knowledge-base integration", () => {
  it("uploads multipart file data without overriding the boundary content type", async () => {
    vi.stubEnv("VAPI_PRIVATE_API_KEY", "test-private-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "vapi-file-id", status: "processing" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadVapiKnowledgeFile(new File(["FAQ"], "faq.txt"));
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(result).toEqual({ id: "vapi-file-id", status: "processing" });
    expect(requestInit.method).toBe("POST");
    expect(new Headers(requestInit.headers).get("Authorization")).toBe(
      "Bearer test-private-key",
    );
    expect(new Headers(requestInit.headers).get("Content-Type")).toBeNull();
    expect(requestInit.body).toBeInstanceOf(FormData);
  });

  it("creates a query tool with only the supplied agent file ids", async () => {
    vi.stubEnv("VAPI_PRIVATE_API_KEY", "test-private-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "vapi-query-tool-id" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      syncVapiKnowledgeTool("12345678-1234-1234-1234-123456789012", ["file-a"], null),
    ).resolves.toBe("vapi-query-tool-id");

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body)) as {
      type: string;
      knowledgeBases: Array<{ provider: string; fileIds: string[] }>;
    };
    expect(requestUrl).toBe("https://api.vapi.ai/tool");
    expect(payload.type).toBe("query");
    expect(payload.knowledgeBases).toEqual([
      { provider: "google", name: expect.any(String), description: expect.any(String), fileIds: ["file-a"] },
    ]);
  });
});
