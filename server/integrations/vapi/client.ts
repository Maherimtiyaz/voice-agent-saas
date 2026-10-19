import "server-only";

const VAPI_API_BASE_URL = "https://api.vapi.ai";

export class VapiApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "VapiApiError";
  }
}

function getPrivateApiKey(): string {
  const key = process.env.VAPI_PRIVATE_API_KEY;
  if (!key) {
    throw new Error(
      "VAPI_PRIVATE_API_KEY is not set. Add it to .env to call the Vapi API.",
    );
  }
  return key;
}

/**
 * Thin wrapper around Vapi's REST API. Deliberately just `fetch` rather
 * than an official SDK: the SDK's TypeScript types have lagged behind
 * documented fields in the past (see README — `phoneCallProviderBypassEnabled`
 * specifically), and a plain typed request/response keeps us in control
 * of exactly what we send.
 */
export async function vapiRequest<TResponse>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown },
): Promise<TResponse> {
  const isFormData = init.body instanceof FormData;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getPrivateApiKey()}`,
  };
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  let body: BodyInit | undefined;
  if (init.body instanceof FormData) {
    body = init.body;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
  }

  const response = await fetch(`${VAPI_API_BASE_URL}${path}`, {
    method: init.method,
    headers,
    body,
    // Voice webhook paths are latency-sensitive; don't let a slow/hung
    // Vapi API call block the Twilio response indefinitely.
    signal: AbortSignal.timeout(8_000),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new VapiApiError(
      `Vapi API request to ${path} failed with status ${response.status}`,
      response.status,
      json,
    );
  }

  return json as TResponse;
}
