import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Shared frame for the public auth screens: brand mark, theme toggle,
 * animated aurora background, and one focal card.
 */
export function AuthShell({
  children,
  contentClassName,
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[42rem] -translate-x-1/2 animate-aurora rounded-full bg-accent/20 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 right-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-[100px]"
      />

      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <Link
        href="/"
        aria-label={`${BRAND.name} home`}
        className="relative mb-8 animate-fade-up rounded-lg"
      >
        <Logo markClassName="h-10 w-10" wordmarkClassName="text-lg" />
      </Link>

      <div
        className={cn(
          "relative w-full max-w-sm animate-fade-up [animation-delay:120ms]",
          contentClassName,
        )}
      >
        {children}
      </div>

      <Link
        href="/"
        className="relative mt-8 animate-fade-in text-sm text-muted transition-colors hover:text-foreground [animation-delay:320ms]"
      >
        ← Back to homepage
      </Link>
    </div>
  );
}
