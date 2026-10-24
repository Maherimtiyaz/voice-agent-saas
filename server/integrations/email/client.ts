import "server-only";

/**
 * Transactional email delivery.
 *
 * The app did not previously send email at all (workspace invitation
 * links had to be copied and pasted by hand), so this module introduces
 * the first email transport. It is deliberately provider-agnostic and
 * dependency-free: it speaks the widely-used `POST /emails` JSON API
 * shape (Resend and several other providers implement it) over plain
 * `fetch`, so adding a new provider means adding a branch here, not
 * adding a dependency.
 *
 * Design notes:
 *
 * - `isEmailConfigured()` is checked BEFORE anything is queued. If no
 *   provider is configured the app keeps its previous behaviour
 *   (show the invite link, let the admin copy it) instead of silently
 *   dropping the email. The caller is responsible for that fallback.
 * - Delivery failures are surfaced as a thrown `EmailDeliveryError`
 *   with the provider's message, and the outbox row records the
 *   error and the attempt count so retries are observable.
 * - The "from" address is a configuration value, never a value taken
 *   from user input, so a form submission can never spoof the sender.
 */

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  providerMessageId: string | null;
}

function getApiKey(): string | null {
  return process.env.EMAIL_API_KEY?.trim() || null;
}

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (!from) {
    throw new Error(
      "EMAIL_FROM is not set. It should be a 'Name <address@example.com>' string.",
    );
  }
  return from;
}

/**
 * Whether a provider is configured well enough to attempt delivery.
 *
 * Callers use this to decide between "send the email" and "fall back
 * to showing a copyable link", so it must never throw.
 */
export function isEmailConfigured(): boolean {
  return Boolean(getApiKey() && process.env.EMAIL_FROM?.trim());
}

/**
 * Sends one email through the configured provider.
 *
 * Throws `EmailDeliveryError` on any provider-side failure so the
 * caller can record the attempt and leave the outbox row retryable.
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new EmailDeliveryError("No email provider is configured.");
  }

  const baseUrl = (process.env.EMAIL_API_URL?.trim() || "https://api.resend.com").replace(
    /\/$/,
    "",
  );

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [params.to],
        subject: params.subject,
        text: params.body,
      }),
    });
  } catch (error) {
    throw new EmailDeliveryError(
      error instanceof Error ? error.message : "The email provider could not be reached.",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmailDeliveryError(
      `The email provider rejected the message (${response.status})${detail ? `: ${detail}` : "."}`,
      response.status,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { id?: string }
    | null;

  return { providerMessageId: payload?.id ?? null };
}
