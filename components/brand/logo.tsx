import { cn } from "@/lib/cn";
import { BRAND } from "@/lib/brand";

/**
 * The SageLine mark: five rounded waveform bars in a gradient tile.
 *
 * The bars only animate on hover (and only when the visitor has not
 * asked for reduced motion), so the mark stays calm at rest while
 * still feeling alive when someone points at it.
 */
export function LogoMark({
  className,
  animated = true,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "logo-mark relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[linear-gradient(135deg,#2dd4bf_0%,#0d9488_52%,#0f766e_100%)] text-white shadow-[0_6px_18px_-6px_rgba(13,148,136,0.75)] ring-1 ring-inset ring-white/20",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.55),transparent_58%)]"
      />
      <svg
        viewBox="0 0 32 32"
        fill="currentColor"
        className="relative h-[62%] w-[62%]"
      >
        <g className={animated ? "logo-bars" : undefined}>
          <rect x="5.4" y="13.2" width="2.6" height="5.6" rx="1.3" />
          <rect x="10.3" y="9.4" width="2.6" height="13.2" rx="1.3" />
          <rect x="15.2" y="5.6" width="2.6" height="20.8" rx="1.3" />
          <rect x="20.1" y="10.6" width="2.6" height="10.8" rx="1.3" />
          <rect x="25" y="14.2" width="2.6" height="3.6" rx="1.3" />
        </g>
      </svg>
    </span>
  );
}

export function Logo({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
  tone = "default",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  tone?: "default" | "sidebar";
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("h-8 w-8", markClassName)} />
      {showWordmark && (
        <span
          className={cn(
            "text-[15px] font-semibold tracking-tight",
            tone === "sidebar" ? "text-sidebar-foreground" : "text-foreground",
            wordmarkClassName,
          )}
        >
          {BRAND.nameLead}
          <span className="text-accent">{BRAND.nameTail}</span>
        </span>
      )}
    </span>
  );
}
