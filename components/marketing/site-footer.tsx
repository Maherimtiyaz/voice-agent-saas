import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#capabilities", label: "Capabilities" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#security", label: "Security" },
      { href: "/#request-demo", label: "Request a demo" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/register", label: "Create a workspace" },
      { href: "/api/v1/agents", label: "Public API" },
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              {BRAND.shortDescription}
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Built for teams that live on the phone
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p>
              © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}.
            </p>
            <p className="mt-1 text-muted/80">
              AI phone agents that answer, book, and hand off.
            </p>
          </div>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <Link
              href="/privacy"
              className="transition-colors hover:text-accent"
            >
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-accent">
              Terms
            </Link>
            <a
              href={`mailto:${BRAND.supportEmail}`}
              className="transition-colors hover:text-accent"
            >
              Contact
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
