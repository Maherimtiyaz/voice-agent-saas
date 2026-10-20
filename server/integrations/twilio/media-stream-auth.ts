import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 5 * 60;

export interface MediaStreamClaims {
  callId: string;
  callSid: string;
  expiresAt: number;
}

function getMediaStreamSecret(): string {
  const secret = process.env.MEDIA_STREAMS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MEDIA_STREAMS_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function assertMediaStreamAuthConfigured(): void {
  getMediaStreamSecret();
}

function sign(payload: string): string {
  return createHmac("sha256", getMediaStreamSecret()).update(payload).digest("base64url");
}

export function createMediaStreamToken(
  params: { callId: string; callSid: string },
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      callId: params.callId,
      callSid: params.callSid,
      expiresAt: nowSeconds + TOKEN_TTL_SECONDS,
    } satisfies MediaStreamClaims),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifyMediaStreamToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): MediaStreamClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as Record<string, unknown>).callId !== "string" ||
      typeof (value as Record<string, unknown>).callSid !== "string" ||
      typeof (value as Record<string, unknown>).expiresAt !== "number"
    ) {
      return null;
    }
    const claims = value as MediaStreamClaims;
    if (
      !Number.isInteger(claims.expiresAt) ||
      claims.expiresAt <= nowSeconds ||
      claims.expiresAt > nowSeconds + TOKEN_TTL_SECONDS
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
