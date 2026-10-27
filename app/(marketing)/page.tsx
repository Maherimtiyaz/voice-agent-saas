import type { Metadata } from "next";
import Link from "next/link";
import { DemoRequestForm } from "@/components/marketing/demo-request-form";
import { HeroCallCard } from "@/components/marketing/hero-call-card";
import {
  ArrowRightIcon,
  BoltIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  CrmIcon,
  DocsIcon,
  GlobeIcon,
  PhoneIcon,
  ShieldIcon,
  SmsIcon,
  SparkIcon,
  TransferIcon,
} from "@/components/marketing/icons";
import { Reveal } from "@/components/marketing/reveal";
import { MarketingFooter } from "@/components/marketing/site-footer";
import { MarketingHeader } from "@/components/marketing/site-header";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "AI phone agents for service businesses",
  description:
    "Answer inbound calls 24/7, book appointments, and keep your CRM up to date with an AI phone agent that knows your business.",
};

const CAPABILITIES = [
  {
    icon: PhoneIcon,
    title: "Answers inbound calls",
    body: "Point a Twilio number at SageLine and the agent picks up, greets the caller, and holds a real conversation instead of playing a recording.",
  },
  {
    icon: CalendarIcon,
    title: "Books appointments",
    body: "The agent checks your connected Google Calendar for real availability, creates the booking, and confirms it to the caller.",
  },
  {
    icon: CrmIcon,
    title: "Works your CRM",
    body: "Connect HubSpot and callers become contacts, work orders become associated deals, and nobody has to re-key a phone call.",
  },
  {
    icon: SmsIcon,
    title: "Sends follow-up SMS",
    body: "Send a confirmation or reminder from your own registered number, with a hard cap so the agent can never blast messages.",
  },
  {
    icon: TransferIcon,
    title: "Hands off to a person",
    body: "When a call needs a human, the agent transfers it with a written briefing of what the caller asked for, so nobody starts from scratch.",
  },
  {
    icon: DocsIcon,
    title: "Answers from your documents",
    body: "Upload price lists, service descriptions, or policies, and the agent answers from those instead of guessing.",
  },
] as const;

const INDUSTRIES = [
  "Dental clinics",
  "HVAC & plumbing",
  "Law firms",
  "Salons & spas",
  "Auto repair",
  "Home care",
  "Veterinary",
  "Cleaning services",
  "Fitness studios",
  "Electrical contractors",
];

const INTEGRATIONS = ["Twilio", "Vapi", "OpenAI", "Google Calendar", "HubSpot"];

const STEPS = [
  {
    step: "01",
    icon: PhoneIcon,
    title: "Create your account",
    body: "Register a workspace and sign in. A workspace owns your agents, numbers, and call history.",
  },
  {
    step: "02",
    icon: GlobeIcon,
    title: "Connect your number",
    body: "Add a Twilio number you own and point its voice webhook at SageLine. We handle the routing.",
  },
  {
    step: "03",
    icon: SparkIcon,
    title: "Configure your agent",
    body: "Write the prompt, pick a voice, add documents, and sync it to the voice runtime.",
  },
  {
    step: "04",
    icon: CheckIcon,
    title: "Place a test call",
    body: "Ring the number. Read the transcript, confirm the outcome, then go live.",
  },
] as const;

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <>
      <MarketingHeader />

      <main className="flex-1 overflow-hidden">
        {/* Hero */}
        <section className="relative isolate overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-70 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_72%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-56 left-1/2 -z-10 h-[38rem] w-[38rem] -translate-x-1/2 animate-aurora rounded-full bg-[radial-gradient(circle,var(--glow-a),transparent_65%)] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 top-32 -z-10 h-96 w-96 rounded-full bg-[radial-gradient(circle,var(--glow-b),transparent_65%)] blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 bottom-0 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,var(--glow-c),transparent_65%)] blur-3xl"
          />

          <div className="mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-24 lg:pt-20">
            <div>
              <p
                className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.06] px-3 py-1 text-xs font-medium text-accent backdrop-blur"
                style={{ animationDelay: "40ms" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-accent opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                Early access · now onboarding service teams
              </p>

              <h1
                className="mt-5 animate-fade-up text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
                style={{ animationDelay: "110ms" }}
              >
                Every missed call is a{" "}
                <span className="text-gradient">
                  customer you never spoke to.
                </span>
              </h1>

              <p
                className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-muted"
                style={{ animationDelay: "190ms" }}
              >
                SageLine gives your business an AI phone agent that answers
                around the clock, understands what the caller needs, books the
                appointment, updates your CRM, and hands off to a person when
                the call actually needs one.
              </p>

              <div
                className="mt-8 flex animate-fade-up flex-col gap-3 sm:flex-row sm:items-center"
                style={{ animationDelay: "270ms" }}
              >
                <Link
                  href="#request-demo"
                  className="btn-shine group inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground shadow-[0_14px_34px_-14px_var(--accent)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-16px_var(--accent)]"
                >
                  Request a demo
                  <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="group inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-surface"
                >
                  See how it works
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform duration-300 group-hover:translate-x-0.5">
                    <ArrowRightIcon className="h-3 w-3" />
                  </span>
                </Link>
              </div>

              <ul
                className="mt-6 flex animate-fade-up flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted"
                style={{ animationDelay: "350ms" }}
              >
                {["No credit card", "Guided pilot", "Live in days"].map(
                  (item) => (
                    <li key={item} className="inline-flex items-center gap-1.5">
                      <CheckIcon className="h-3.5 w-3.5 text-accent" />
                      {item}
                    </li>
                  ),
                )}
              </ul>

              <p className="mt-6 text-sm text-muted">
                Already piloting with us?{" "}
                {user ? (
                  <Link
                    href="/dashboard"
                    className="font-medium text-accent underline-offset-4 hover:underline"
                  >
                    Go to your dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="font-medium text-accent underline-offset-4 hover:underline"
                    >
                      Log in
                    </Link>{" "}
                    or{" "}
                    <Link
                      href="/register"
                      className="font-medium text-accent underline-offset-4 hover:underline"
                    >
                      create a workspace
                    </Link>
                  </>
                )}
              </p>
            </div>

            <div
              className="animate-fade-up"
              style={{ animationDelay: "230ms" }}
            >
              <HeroCallCard />
            </div>
          </div>

          <div className="border-t border-border/70 bg-surface/50 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 text-xs text-muted sm:px-6">
              <span className="font-semibold uppercase tracking-[0.18em] text-foreground/70">
                Works with
              </span>
              {INTEGRATIONS.map((name) => (
                <span key={name} className="inline-flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-accent/70" />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Industry marquee */}
        <section className="border-b border-border bg-surface/60 py-7">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
              Built for teams where the phone is the front door
            </p>
          </div>
          <div className="mask-fade-x mt-5 overflow-hidden">
            <div className="flex w-max animate-marquee gap-2.5 hover:[animation-play-state:paused]">
              {[...INDUSTRIES, ...INDUSTRIES].map((industry, index) => (
                <span
                  key={`${industry}-${index}`}
                  className="whitespace-nowrap rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Who it's for */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Who it&apos;s for
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Built for businesses that live on the phone
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                If most of your revenue starts with a phone call, you cannot
                afford to be closed, put on hold, or sent to voicemail. SageLine
                is for the teams where a call is the first step in a sale, a
                booking, or a service visit.
              </p>
              <div className="mt-7 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <BoltIcon className="h-4 w-4" />
                </span>
                <p className="text-sm leading-relaxed text-muted">
                  <span className="font-medium text-foreground">
                    One number, one agent, zero voicemail.
                  </span>{" "}
                  Calls resolve to your workspace — never an arbitrary agent.
                </p>
              </div>
            </Reveal>

            <Reveal delay={130}>
              <ul className="flex flex-col gap-3">
                {[
                  "Take inbound calls outside business hours and currently lose them to voicemail.",
                  "Spend staff time repeating the same questions on every call.",
                  "Book appointments by hand and need it to land in your calendar automatically.",
                  "Want call outcomes recorded in your CRM without someone retyping them.",
                  "Need a person to pick up the moment a call stops being routine.",
                ].map((item) => (
                  <li
                    key={item}
                    className="group flex items-start gap-3 rounded-xl border border-transparent p-2 text-sm leading-relaxed text-muted transition-all duration-300 hover:border-border hover:bg-surface hover:pl-3"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110">
                      <CheckIcon className="h-3 w-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Capabilities */}
        <section
          id="capabilities"
          className="scroll-mt-24 border-b border-border bg-surface"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Capabilities
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                What the agent actually does
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                The agent is not a call deflector. It talks to your callers with
                a prompt you write, then acts on what they say.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((capability, index) => {
                const Icon = capability.icon;
                return (
                  <Reveal key={capability.title} delay={index * 70} className="h-full">
                    <article className="card-lift group h-full rounded-2xl border border-border bg-background p-6">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        {capability.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {capability.body}
                      </p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* Campaigns / legibility */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Outbound
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Outbound campaigns, without the cold-call script
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Create a campaign from your own caller ID, add the contacts you
                have consent to contact, and let your agent work through them
                one call at a time. Every call is recorded with its transcript
                and outcome, so you can see what was said and what happened —
                not just a dial count.
              </p>
              <p className="mt-4 leading-relaxed text-muted">
                Campaigns currently run one call at a time, with you in control.
                We are not advertising unattended dialling yet because it is not
                built.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: ClockIcon, label: "Paced", value: "One at a time" },
                  { icon: CalendarIcon, label: "Scheduled", value: "Set a start" },
                  { icon: ShieldIcon, label: "Bounded", value: "Max attempts" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border bg-surface px-4 py-3"
                  >
                    <stat.icon className="h-4 w-4 text-accent" />
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">
                      {stat.label}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={130}>
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_20px_60px_-40px_var(--shadow-color)]">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <ClockIcon className="h-4 w-4" />
                  </span>
                  Every call is legible afterwards
                </h3>
                <ul className="mt-5 flex flex-col gap-3 text-sm text-muted">
                  {[
                    "Full transcript, in order, for every inbound and outbound call.",
                    "A clear outcome: appointment booked, work order created, transferred, or nothing.",
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
                <div className="mt-6 rounded-xl border border-dashed border-border bg-background px-4 py-3 font-mono text-[11px] text-muted">
                  <span className="text-accent">GET</span> /api/v1/calls?limit=25
                  <br />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    200 OK
                  </span>{" "}
                  · workspace-scoped · no-store
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="scroll-mt-24 border-b border-border bg-surface"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Getting to your first test call
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Four steps. The dashboard keeps a checklist of exactly where you
                are, so you always know what is left.
              </p>
            </Reveal>

            <div className="relative mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div
                aria-hidden
                className="absolute left-8 right-8 top-12 hidden h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent lg:block"
              />
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Reveal key={step.step} delay={index * 90} className="relative h-full">
                    <div className="card-lift group h-full rounded-2xl border border-border bg-background p-5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-accent">
                          {step.step}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110">
                          <Icon className="h-4 w-4" />
                        </span>
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">
                        {step.body}
                      </p>
                    </div>
                  </Reveal>
                );
              })}
            </div>

            <Reveal delay={220}>
              <div className="mt-10 rounded-2xl border border-border bg-background p-6">
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
            </Reveal>
          </div>
        </section>

        {/* Security */}
        <section
          id="security"
          className="scroll-mt-24 border-b border-border"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl border border-border bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_12%,var(--surface)),var(--surface)_58%)] p-8 sm:p-10">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 animate-aurora rounded-full bg-accent/20 blur-3xl"
                />
                <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                  <div>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                      <ShieldIcon className="h-4 w-4" />
                      Tenant-safe by design
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      The phone number decides the agent. Nothing else.
                    </h2>
                    <p className="mt-4 leading-relaxed text-muted">
                      Every inbound call is resolved through our own
                      phone&nbsp;numbers → agents → organizations chain — never
                      from an ID in the request payload. Your callers only ever
                      reach your agent.
                    </p>
                  </div>
                  <ul className="grid gap-3">
                    {[
                      "Signed webhooks from Twilio and Vapi",
                      "Hashed API keys and a read-only public API",
                      "Role-based workspace membership",
                      "Every tool call logged and organization-scoped",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3 text-sm text-foreground backdrop-blur"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Final CTA + demo form */}
        <section
          id="request-demo"
          className="relative scroll-mt-24 overflow-hidden"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--glow-a),transparent_62%)]"
          />
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-5 lg:gap-16">
            <Reveal className="lg:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Early access
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Hear your own phone answered by SageLine.
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                We are onboarding a small number of businesses at a time so we
                can configure each one properly. Tell us how your phone works
                today and we&apos;ll show you the agent handling it.
              </p>
              <p className="mt-4 leading-relaxed text-muted">
                No credit card, no self-service checkout. We run a guided pilot,
                then you decide.
              </p>

              <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
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
                    className="group inline-flex items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all duration-300 hover:-translate-y-0.5"
                  >
                    Log in
                    <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40"
                  >
                    Create a workspace
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120} className="lg:col-span-3">
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_30px_80px_-50px_var(--shadow-color)] sm:p-7">
                <h3 className="text-lg font-semibold text-foreground">
                  Request a demo
                </h3>
                <p className="mb-6 mt-1 text-sm text-muted">
                  Tell us what you need the agent to do and we&apos;ll prepare a
                  demo around it.
                </p>
                <DemoRequestForm />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </>
  );
}
