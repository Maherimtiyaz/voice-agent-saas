import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LegalList, LegalPage, LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND.name} collects, uses, and protects account data, call transcripts, and the information you connect to your workspace.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary={`This policy explains what ${BRAND.name} collects when you visit our website, request a demo, or run AI phone agents in your workspace — including how call recordings and transcripts are handled.`}
    >
      <LegalSection title="Who we are">
        <p>
          {BRAND.name} provides AI phone agents for service businesses. In this
          policy, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean {BRAND.name}, and
          &ldquo;you&rdquo; means the person visiting this website or the
          business operating a workspace.
        </p>
        <p>
          We act as the controller of website and lead data, and as a processor
          of the call and customer data that a business puts into its workspace.
        </p>
      </LegalSection>

      <LegalSection title="Information you give us">
        <LegalList
          items={[
            "Account details: your name, email address, password (stored only as a bcrypt hash), and the name of the workspace you create.",
            "Workspace content: agent names and prompts, phone numbers, campaign contacts, call records, transcripts, tool results, and documents you upload for the agent to answer from.",
            "Integration data: the Google Calendar and HubSpot accounts you connect, plus the access and refresh tokens needed to act on your behalf. Refresh tokens are encrypted at rest.",
            "Demo requests: the name, email, company, phone number, use case, and message you submit through the landing-page form.",
            "Billing details, once billing exists: handled by a payment processor — we do not store card numbers.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Information collected automatically">
        <LegalList
          items={[
            "Server logs: request paths, timestamps, response status, and error messages. These are used to operate and secure the service.",
            "Session data: a signed, HTTP-only cookie that keeps you logged in. It is not used for advertising.",
            "Rate-limit records: a short-lived counter keyed by IP address or API key, so the service can enforce abuse limits.",
            "A theme preference stored in your browser's local storage. It never leaves your device.",
          ]}
        />
      </LegalSection>

      <LegalSection
        id="recording"
        title="Call recordings, transcripts, and consent"
      >
        <p>
          Calls handled by an agent are <strong>transcribed</strong>, and the
          transcript is stored with the call record in the workspace so the
          business can review what was said. Call audio may also be recorded by
          our telephony and voice providers, and is retained by them under their
          own policies.
        </p>
        <p>
          Agents built on {BRAND.name} are instructed to disclose at the start of
          every call that the call may be recorded and transcribed. That
          disclosure is part of the agent&rsquo;s system prompt and is spoken in
          the language the agent is configured to use.
        </p>
        <p>
          Recording law in the United States varies by state: some states require
          only one party&rsquo;s consent, others require every party to be told.
          Businesses using {BRAND.name} are responsible for complying with the law
          that applies to their callers, including providing any additional notice
          or obtaining any additional consent their jurisdiction requires. If a
          caller does not want to be recorded, the agent can transfer them to a
          person where a transfer number is configured, or end the call.
        </p>
        <p>
          Call data belongs to the business that owns the workspace. We access it
          to operate and support the service, not to build advertising profiles.
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <LegalList
          items={[
            "To provide the service: answer calls, run the agent, book appointments, write to your CRM, send SMS, and show you transcripts and analytics.",
            "To secure the service: verify webhook signatures, authenticate sessions, enforce rate limits, and investigate abuse.",
            "To support you: respond to your questions and reproduce problems you report.",
            "To improve the product: in aggregate, using operational data rather than the content of your calls.",
            "To contact you about your workspace, a demo you requested, or material changes to this policy.",
          ]}
        />
        <p>
          We do not sell personal information, and we do not use call content to
          train advertising models.
        </p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>
          We share only what each provider needs to do its job, under contract and
          only for our purposes:
        </p>
        <LegalList
          items={[
            "Twilio — telephony: places and receives calls, sends SMS from your registered number.",
            "Vapi — voice agent orchestration: runs conversations and reports call events back to us.",
            "OpenAI — speech transcription, language model responses, and optional call-briefing summaries.",
            "Google Calendar — reads availability and creates bookings when you connect it.",
            "HubSpot — creates and updates contacts and deals when you connect it.",
            "Our email provider — delivers invitation and notification email.",
            "Our hosting and database providers — run the application and store workspace data.",
          ]}
        />
        <p>
          These providers process data in the United States and may process it in
          other countries where they operate. Each is bound by its own data
          processing terms.
        </p>
      </LegalSection>

      <LegalSection title="When we may disclose information">
        <LegalList
          items={[
            "When you ask us to, or when your workspace administrator connects an integration.",
            "When required by law, subpoena, or a lawful request from a public authority.",
            "To protect the rights, safety, or property of our users, the public, or us.",
            "In connection with a merger, acquisition, or sale of assets, in which case we will tell you before your data becomes subject to a different policy.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Retention">
        <p>
          We keep workspace data for as long as the workspace exists. If you
          close your account, we delete or anonymize workspace data within a
          reasonable period, except where we must keep records for legal,
          tax, or fraud-prevention reasons.
        </p>
        <p>
          Demo requests are kept until we have followed up and for a reasonable
          period afterwards, so we do not lose the thread of a conversation you
          started. Rate-limit counters are short-lived and pruned.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <LegalList
          items={[
            "Passwords are hashed with bcrypt and never stored or logged in plain text.",
            "Sessions use signed, HTTP-only cookies with the secure flag in production.",
            "API keys are stored hashed and can be revoked.",
            "CRM refresh tokens are encrypted with AES-256-GCM.",
            "Inbound Twilio and Vapi webhooks are verified before they are processed.",
            "Every record is scoped to one organization, and cross-tenant reads are rejected.",
          ]}
        />
        <p>
          No service is perfectly secure. If we become aware of a breach affecting
          your data, we will notify you as required by applicable law.
        </p>
      </LegalSection>

      <LegalSection title="Your choices and rights">
        <LegalList
          items={[
            "Access and correction: most data is visible and editable in your workspace; you can also ask us for a copy.",
            "Deletion: you can delete agents, contacts, and calls, or ask us to close the workspace and delete its data.",
            "Marketing email: every message we send will include a way to stop receiving it. Transactional mail about your account is not optional while the account is open.",
            "Cookies: we use only the session cookie and a local theme preference, so there is nothing to opt out of beyond logging out.",
            "Regional rights: if you are in the EEA, UK, or a US state with a consumer privacy law, you may have additional rights to access, correct, delete, or port your data, and to appeal a decision. Write to us and we will honour them.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Children">
        <p>
          The service is for businesses and is not directed to anyone under 18.
          We do not knowingly collect personal information from children. Callers
          may be of any age, but we do not use call data for marketing.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If we make a material change, we will update the date at the top of this
          page and, where the change affects your rights, tell workspace
          administrators by email before it takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
