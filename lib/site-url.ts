import { BRAND } from "@/lib/brand";

/**
 * The public origin of this deployment.
 *
 * Prefers `APP_URL` because that is also what Twilio signatures are
 * verified against, so the canonical URL and the voice webhook origin
 * can never disagree. Falls back to the marketing domain for a build
 * that has no environment configured.
 */
export function siteUrl(): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return configured || `https://${BRAND.domain}`;
}
