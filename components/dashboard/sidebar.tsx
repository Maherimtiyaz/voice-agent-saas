"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/components/dashboard/nav-items";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/cn";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-sidebar text-sidebar-foreground lg:flex">
      <div className="px-5 py-5">
        <Link
          href="/dashboard"
          aria-label={`${BRAND.name} dashboard`}
          className="rounded-lg"
        >
          <Logo tone="sidebar" />
        </Link>
      </div>
      <nav className="flex flex-col gap-0.5 px-3" aria-label="Dashboard">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative rounded-md px-3 py-2 text-sm transition-all duration-300",
                isActive
                  ? "bg-white/10 text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-white/5 hover:pl-3.5 hover:text-sidebar-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent transition-all duration-300",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60",
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
    </aside>
  );
}
