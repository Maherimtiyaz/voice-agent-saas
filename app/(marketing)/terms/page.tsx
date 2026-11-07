import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { LegalList, LegalPage, LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that apply when you use ${BRAND.name}, including acceptable use of outbound calling, recording disclosures, and the limits of an AI phone agent.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary={`These terms apply when you use ${BRAND.name}. They cover the early-access pilot, acceptable use of outbound calling, your responsibilities when calls are recorded, and what an AI phone agent can and cannot promise.`}
    >
      <LegalSection title="Agreement">
        <p>
          By creating a workspace, using the service, or asking us to run a demo
          for you, you agree to these terms. If you are agreeing on behalf of a
          business, you confirm you are allowed to bind that business.
        </p>
        <p>
          If a signed pilot or subscription agreement exists between us, that
          agreement controls where it conflicts with these terms.
        </p>
      </LegalSection>

      <LegalSection title="The service">
        <p>
          {BRAND.name} provides AI phone agents that answer calls, hold a
          conversation, use tools to book appointments, create CRM records, send
          SMS, and transfer to a person. The agent follows a prompt that you
          control.
        </p>
        <p>
          We are in early access. Features described on this website are the
          product we are building, not a guarantee that every feature is available
          in your workspace today. We will tell you what is included before you
          start a pilot.
        </p>
      </LegalSection>

      <LegalSection title="Not an emergency service">
        <p>
          {BRAND.name} is not a replacement for emergency services, medical
          advice, or a monitored alarm line. Do not configure an agent, or tell
          callers to rely on one, for emergencies or any situation where a delay
          could cause harm. Callers in an emergency should contact local
          emergency services directly.
        </p>
      </LegalSection>

      <LegalSection title="Accounts and workspaces">
        <LegalList
          items={[
            "You are responsible for the accuracy of the information on your account and for keeping your password and API keys secret.",
            "Workspace administrators can invite, remove, and change the role of other members. Actions taken by a member are treated as actions by the workspace.",
            "You must be old enough to enter a contract and must not use the service if you have previously been removed for abuse.",
            "Tell us promptly if you believe an account or API key has been compromised.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Pilot, fees, and billing">
        <p>
          Early access is arranged directly with us and priced in a separate
          written agreement. This website does not offer self-service checkout and
          takes no payment. No fees apply until you and we agree to them in
          writing.
        </p>
        <p>
          You are responsible for the costs of the third-party services you connect
          to your own accounts, such as telephony, voice, language-model, calendar,
          or CRM usage.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" title="Acceptable use">
        <p>You agree not to use the service to:</p>
        <LegalList
          items={[
            "Place calls or send messages without the consent required by law, including the Telephone Consumer Protection Act and applicable state law, or in violation of a do-not-call registry.",
            "Run unattended, high-volume outbound dialling. Campaigns must be started and supervised by a person.",
            "Record a call without providing the notice required in the caller's jurisdiction.",
            "Impersonate a person or organization, or misrepresent that a caller is speaking to a human.",
            "Harass, threaten, defraud, or deceive anyone, or collect payment card details by voice.",
            "Offer medical, legal, or financial advice that requires a licensed professional.",
            "Upload content that is unlawful, infringing, or malicious, or attempt to make the agent produce it.",
            "Probe, scan, overload, or attempt to bypass the security or rate limits of the service, or access another organization's data.",
            "Resell or white-label the service without a written agreement with us.",
          ]}
        />
        <p>
          We may suspend a workspace that we reasonably believe is being used in
          breach of this section, and we will tell you why.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibilities for calls">
        <LegalList
          items={[
            "You decide who your agent calls, what it says, and which tools it may use.",
            "You are responsible for obtaining consent for outbound calls and messages, and for honouring opt-outs and do-not-call requests.",
            "You are responsible for any additional recording notice your jurisdiction requires beyond the disclosure the agent speaks.",
            "You must keep the contact information you upload accurate and lawful to process.",
            "You must make sure any transfer number, greeting, and business information in the agent's prompt are correct.",
          ]}
        />
        <p>
          You indemnify us against claims arising from calls you instruct the
          service to make or from content you supply, except to the extent the
          claim results from our own breach of these terms.
        </p>
      </LegalSection>

      <LegalSection title="What an AI agent can and cannot do">
        <p>
          Language models can misunderstand a caller, mishear a number, or produce
          an answer that is wrong even when the prompt is correct. The agent is
          instructed not to claim an action succeeded unless a tool confirms it,
          and every tool call is logged — but you should review call records,
          bookings, and CRM changes rather than assume they are correct.
        </p>
        <p>
          The agent is not a person. Where the law or your own policy requires a
          human to handle a request, configure a transfer and make sure somebody
          answers it.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          The service depends on providers such as Twilio, Vapi, OpenAI, Google,
          HubSpot, and our hosting and database providers. Their availability and
          their terms are outside our control. If a provider changes its API or
          pricing, we may need to change or limit the corresponding feature.
        </p>
        <p>
          When you connect an account, you authorize us to act on it within the
          scopes you grant, and you can revoke that access at any time in the
          provider&rsquo;s settings or in your workspace.
        </p>
      </LegalSection>

      <LegalSection title="Your data and our software">
        <p>
          You keep ownership of the data you put into your workspace, including
          contacts, prompts, documents, calls, and transcripts. You grant us a
          limited licence to store, process, and transmit that data to operate the
          service and to provide support.
        </p>
        <p>
          We own the service itself — the software, the design, and the
          documentation. These terms do not transfer any of that to you. You may
          not copy, resell, or reverse engineer the service except as allowed by
          law.
        </p>
        <p>
          We may use aggregated, de-identified operational data (such as call
          counts and error rates) to run and improve the product. We do not use
          your call content to train models for other customers.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          We aim to keep the service available, but early access comes without a
          service-level agreement. We may change, deprecate, or pause features, and
          we may perform maintenance that interrupts calls. Where a change
          materially reduces what you have been promised in writing, we will give
          reasonable notice.
        </p>
      </LegalSection>

      <LegalSection title="Suspension and termination">
        <LegalList
          items={[
            "You can stop using the service at any time and ask us to close your workspace.",
            "We can suspend or terminate access for a material breach of these terms, for non-payment under a separate agreement, or where required by law.",
            "On termination we will make workspace data available for export for a reasonable period, then delete it, except where we must retain records by law.",
            "Sections that by their nature survive termination — ownership, disclaimers, liability limits, and indemnities — continue to apply.",
          ]}
        />
      </LegalSection>

      <LegalSection title="Disclaimers">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. To the fullest extent permitted by law, we disclaim
          implied warranties of merchantability, fitness for a particular purpose,
          and non-infringement. We do not warrant that calls will never fail, that
          a transcript will be complete, or that an agent&rsquo;s answer will be
          correct.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither party is liable for
          indirect, incidental, special, consequential, or punitive damages, or for
          lost profits, revenue, or data. Our total liability arising out of these
          terms is limited to the greater of the amount you paid us in the twelve
          months before the claim or one hundred US dollars.
        </p>
        <p>
          Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws applicable at our principal place of
          business, without regard to conflict-of-law rules. The courts located
          there have exclusive jurisdiction over disputes, unless a separate signed
          agreement says otherwise.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms as the product changes. If a change materially
          affects your obligations, we will update the date at the top of this page
          and tell workspace administrators by email before it takes effect.
          Continuing to use the service after that means you accept the updated
          terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
