import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/site-footer";
import { MarketingHeader } from "@/components/marketing/site-header";
import { BRAND } from "@/lib/brand";

/** Shown at the top of both legal pages; bump when the text changes. */
export const LEGAL_LAST_UPDATED = "October 31, 2026";

export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        <div className="relative overflow-hidden border-b border-border bg-surface">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--glow-a),transparent_65%)]"
          />
          <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Legal
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted">{summary}</p>
            <p className="mt-6 text-xs text-muted/80">
              Last updated {LEGAL_LAST_UPDATED}
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-10">{children}</div>

          <div className="mt-14 rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-base font-semibold text-foreground">
              Questions?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Write to{" "}
              <a
                href={`mailto:${BRAND.supportEmail}`}
                className="font-medium text-accent underline-offset-4 hover:underline"
              >
                {BRAND.supportEmail}
              </a>{" "}
              and a person will answer.
            </p>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-accent">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
