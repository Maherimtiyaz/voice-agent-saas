import type { Metadata } from "next";
import { BRAND, BRAND_TITLE, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

export const metadata: Metadata = {
  title: {
    default: BRAND_TITLE,
    template: BRAND_TITLE_TEMPLATE,
  },
  description:
    "AI phone agents that answer inbound calls, book appointments, create CRM records, and hand off to a human when it matters. Built for service businesses that live on the phone.",
  openGraph: {
    title: BRAND_TITLE,
    description:
      "Answer inbound calls, book appointments, and work your CRM automatically with an AI phone agent built for service businesses.",
    type: "website",
    siteName: BRAND.name,
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
