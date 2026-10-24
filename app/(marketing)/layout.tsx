import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Voice Agent Platform — AI phone agents for real business workflows",
    template: "%s · Voice Agent Platform",
  },
  description:
    "Build AI phone agents that answer inbound calls, book appointments, create CRM records, and hand off to a human when it matters. Built for service businesses that live on the phone.",
  openGraph: {
    title: "Voice Agent Platform — AI phone agents for real business workflows",
    description:
      "Answer inbound calls, book appointments, and work your CRM automatically with an AI phone agent built for service businesses.",
    type: "website",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
