import Link from "next/link";

/**
 * Marketing site header.
 *
 * Login and registration are deliberately two SEPARATE links, not a
 * combined "Sign in / Sign up" toggle. They lead to two different
 * pages with two different intents, and keeping them distinct is
 * clearer for someone arriving from a demo request.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-accent-foreground"
          >
            V
          </span>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Voice Agent Platform
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/#capabilities"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-black/[0.04] hover:text-foreground sm:inline-block"
          >
            Capabilities
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-black/[0.04] hover:text-foreground sm:inline-block"
          >
            How it works
          </Link>
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-black/[0.04]"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Create account
          </Link>
        </nav>
      </div>
    </header>
  );
}
