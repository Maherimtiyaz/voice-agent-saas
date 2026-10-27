"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Below the `lg` breakpoint the sidebar is hidden, so navigation moves
 * into this drawer. Rendering the trigger here (rather than inside the
 * sidebar) keeps the topbar's left edge aligned with the content.
 */
export function MobileNav() {
  const pathname = usePathname();
  // Keyed by pathname, so navigating closes the drawer without an effect.
  const [openForPath, setOpenForPath] = useState<string | null>(null);
  const open = openForPath === pathname;
  const close = () => setOpenForPath(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenForPath(null);
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenForPath(pathname)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground lg:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          className="h-5 w-5"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={close}
              className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
            />
            <div
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard navigation"
              className="animate-fade-in relative flex h-full w-64 max-w-[80%] flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-5">
                <Link
                  href="/dashboard"
                  aria-label={`${BRAND.name} dashboard`}
                  className="rounded-lg"
                >
                  <Logo tone="sidebar" />
                </Link>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close navigation"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    className="h-4 w-4"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <nav
                className="flex flex-col gap-0.5 px-3"
                aria-label="Dashboard"
              >
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-white/10 text-sidebar-foreground"
                          : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-opacity",
                          isActive
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-60",
                        )}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto px-5 py-5">
                <p className="text-[11px] leading-relaxed text-sidebar-muted/80">
                  AI phone agents that answer, book, and hand off.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
