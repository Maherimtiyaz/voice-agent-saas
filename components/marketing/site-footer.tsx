import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Voice Agent Platform
          </p>
          <p className="mt-1 text-xs text-muted">
            AI phone agents that answer, book, and hand off.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link
            href="/#capabilities"
            className="text-muted transition-colors hover:text-foreground"
          >
            Capabilities
          </Link>
          <Link
            href="/#how-it-works"
            className="text-muted transition-colors hover:text-foreground"
          >
            How it works
          </Link>
          <Link
            href="/#request-demo"
            className="text-muted transition-colors hover:text-foreground"
          >
            Request a demo
          </Link>
          <Link
            href="/login"
            className="text-muted transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="text-muted transition-colors hover:text-foreground"
          >
            Create account
          </Link>
        </nav>
      </div>
    </footer>
  );
}
