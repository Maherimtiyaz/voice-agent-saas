/**
 * Product identity in one place.
 *
 * Every user-facing mention of the product name should read from here
 * rather than hard-coding a string, so a future rename is a one-file
 * change.
 */
export const BRAND = {
  name: "SageLine",
  /** Used where the two-tone wordmark needs explicit halves. */
  nameLead: "Sage",
  nameTail: "Line",
  tagline: "AI phone agents for service businesses",
  shortDescription:
    "AI phone agents that answer every call, book the job, and hand off to a person when it matters.",
  supportEmail: "hello@sageline.ai",
  domain: "sageline.ai",
} as const;

export const BRAND_TITLE = `${BRAND.name} — ${BRAND.tagline}`;
export const BRAND_TITLE_TEMPLATE = `%s · ${BRAND.name}`;
