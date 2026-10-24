import type { Metadata } from "next";
import Link from "next/link";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";
import { MarketingFooter } from "@/components/marketing/site-footer";
import { MarketingHeader } from "@/components/marketing/site-header";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "AI phone agents for service businesses",
  description:
    "Answer inbound calls 24/7, book appointments, and keep your CRM up to date with an AI phone agent that knows your business.",
};

/**
 * The public landing page.
 *
 * Two deliberate constraints, both because billing is not implemented
 * yet:
 *
 * 1. There is no pricing section and no plan comparison. Advertising
 *    self-service paid plans that cannot be purchased is worse than
 *    not advertising them — it generates sign-ups that then hit a
 *    dead end at checkout. The CTA is "Request a demo" / "Join early
 *    access" instead.
 * 2. Creating an account is still offered, but it is framed as
 *    "start a workspace" for teams already invited or piloting, not
 *    as "start your free trial".
 */
export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <>
      <MarketingHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="max-w-3xl">
              <p className="inline-flex items-center rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">
                Early access
              </p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Every missed call is a customer you never spoke to.
              </h1>
              <p className="mt-5 text-lg text-muted">
                Voice Agent Platform gives service businesses an AI phone agent
                that answers inbound calls, understands what the caller needs,
                books the appointment, updates your CRM, and hands off to a
                person when the call actually needs one.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#request-demo"
                  className="inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  Request a demo
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/[0.02]"
                >
                  See how it works
                </a>
              </div>

              <p className="mt-4 text-sm text-muted">
                Already piloting with us?{" "}
                {user ? (
                  <Link
                    href="/dashboard"
                    className="font-medium text-accent hover:underline"
                  >
                    Go to your dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="font-medium text-accent hover:underline"
                    >
                      Log in
                    </Link>{" "}
                    or{" "}
                    <Link
                      href="/register"
                      className="font-medium text-accent hover:underline"
                    >
                      create a workspace
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Built for businesses that live on the phone
                </h2>
                <p className="mt-4 text-muted">
                  If most of your revenue starts with a phone call, you cannot
                  afford to be closed, put on hold, or sent to voicemail. This
                  platform is for the teams where a call is the first step in a
                  sale, a booking, or a service visit.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  A good fit if you
                </h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {[
                    "Take inbound calls outside business hours and currently lose them to voicemail.",
                    "Spend staff time repeating the same questions on every call.",
                    "Book appointments by hand and need it to land in your calendar automatically.",
                    "Want call outcomes recorded in your CRM without someone retyping them.",
                    "Need a person to pick up the moment a call stops being routine.",
                  ].map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-muted">
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="scroll-mt-20 border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              What the agent actually does
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              The agent is not a call deflector. It talks to your callers with
              a prompt you write, then acts on what they say.
            </p>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Answers inbound calls",
                  body: "Point a Twilio number at the platform and the agent picks up, greets the caller, and holds a real conversation instead of playing a recording.",
                },
                {
                  title: "Books appointments",
                  body: "The agent checks your connected Google Calendar for real availability and creates the booking — then confirms it to the caller.",
                },
                {
                  title: "Works your CRM",
                  body: "Connect HubSpot and callers become contacts, work orders become associated deals, and nobody has to re-key a phone call.",
                },
                {
                  title: "Sends follow-up SMS",
                  body: "Send a confirmation or a reminder from your own registered number, without letting the agent blast messages.",
                },
                {
                  title: "Hands off to a person",
                  body: "When a call needs a human, the agent transfers it with a written briefing of what the caller asked for, so nobody starts from scratch.",
                },
                {
                  title: "Answers from your documents",
                  body: "Upload price lists, service descriptions, or policies, and the agent answers from those instead of guessing.",
                },
              ].map((capability) => (
                <div
                  key={capability.title}
                  className="rounded-lg border border-border bg-background p-5"
                >
                  <h3 className="text-base font-semibold text-foreground">
                    {capability.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted">{capability.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Campaigns */}
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Outbound campaigns, without the cold-call script
                </h2>
                <p className="mt-4 text-muted">
                  Create a campaign from your own caller ID, add the contacts
                  you have consent to contact, and let your agent work through
                  them one call at a time. Every call is recorded with its
                  transcript and outcome, so you can see what was said and what
                  happened — not just a dial count.
                </p>
                <p className="mt-4 text-muted">
                  Campaigns currently run one call at a time, with you in
                  control. We are not advertising unattended dialling yet
                  because it is not built.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-6">
                <h3 className="text-base font-semibold text-foreground">
                  Every call is legible afterwards
                </h3>
                <ul className="mt-4 flex flex-col gap-3 text-sm text-muted">
                  {[
                    "Full transcript, in order, for every inbound and outbound call.",
                    "A clear outcome on the call: appointment booked, work order created, transferred, or nothing.",
                    "Every tool the agent used, with its input, output, and duration.",
                    "Call volume, outcomes, and average duration over time.",
                    "A read-only API so your own tools can read the same records.",
                  ].map((item) => (
                    <li key={item} className="flex gap-3">
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* How it works / onboarding */}
        <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Getting to your first test call
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Four steps. The dashboard keeps a checklist of exactly where you
              are, so you always know what is left.
            </p>

            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: "01",
                  title: "Create your account",
                  body: "Register a workspace and sign in. A workspace owns your agents, numbers, and call history.",
                },
                {
                  step: "02",
                  title: "Set up your phone number",
                  body: "Bring a Twilio number you own, or have us provision one for you. Point its voice webhook at the platform.",
                },
                {
                  step: "03",
                  title: "Configure your assistant",
                  body: "Write the agent's prompt, pick a voice, and sync it to the voice runtime. Optionally add your documents and calendar.",
                },
                {
                  step: "04",
                  title: "Place a test call",
                  body: "Ring the number. Read the transcript, confirm the outcome, then go live.",
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="rounded-lg border border-border bg-background p-5"
                >
                  <span className="font-mono text-xs font-semibold text-accent">
                    {item.step}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted">{item.body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-10 rounded-lg border border-border bg-background p-6">
              <h3 className="text-base font-semibold text-foreground">
                What we handle for you
              </h3>
              <div className="mt-4 grid gap-x-10 gap-y-3 text-sm text-muted sm:grid-cols-2">
                {[
                  "The Twilio and Vapi wiring between your number and the agent.",
                  "Tenant-safe routing — your callers only ever reach your agent.",
                  "A signed, scoped API key for your own systems.",
                  "Workspace roles, so you can give a colleague access.",
                ].map((item) => (
                  <p key={item} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="request-demo" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-5 lg:gap-16">
              <div className="lg:col-span-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Join early access
                </h2>
                <p className="mt-4 text-muted">
                  We are onboarding a small number of businesses at a time so we
                  can configure each one properly. Tell us how your phone
                  works today and we&apos;ll show you the agent handling it.
                </p>
                <p className="mt-4 text-muted">
                  No credit card, no self-service checkout. We run a guided
                  pilot, then you decide.
                </p>

                <div className="mt-8 rounded-lg border border-border bg-surface p-5">
                  <h3 className="text-sm font-semibold text-foreground">
                    Already have an account?
                  </h3>
                  <p className="mt-2 text-sm text-muted">
                    Sign in to your workspace, or create a new one to try the
                    setup flow.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
                    >
                      Log in
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/[0.02]"
                    >
                      Create a workspace
                    </Link>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3">
                <div className="rounded-lg border border-border bg-surface p-6">
                  <h3 className="text-base font-semibold text-foreground">
                    Request a demo
                  </h3>
                  <p className="mb-5 mt-1 text-sm text-muted">
                    Tell us what you need the agent to do and we&apos;ll prepare
                    a demo around it.
                  </p>
                  <DemoRequestForm />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
