import { CalendarIcon, CrmIcon, PhoneIcon, SparkIcon } from "./icons";

const WAVE_HEIGHTS = [
  22, 38, 58, 34, 72, 48, 90, 64, 44, 78, 96, 56, 36, 68, 88, 52, 30, 60, 82,
  46, 26, 54, 74, 42, 32, 66, 92, 58, 38, 70, 50, 28, 62, 44, 34, 24,
];

/**
 * A stylised "live call" illustration for the hero.
 *
 * Purely decorative — the transcript is fixed copy, not live data — so
 * it is hidden from assistive tech and the surrounding section carries
 * the real marketing message.
 */
export function HeroCallCard() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_30%_20%,color-mix(in_srgb,var(--accent)_35%,transparent),transparent_65%)] blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/90 shadow-[0_30px_80px_-30px_rgba(9,40,38,0.45)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-5 py-3.5">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping-slow rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Inbound call
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted">00:41</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            <SparkIcon className="h-3 w-3" />
            AI answering
          </span>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f59e0b,#ef4444)] text-xs font-semibold text-white">
              JR
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">Jordan Reyes</p>
              <p className="text-[11px] text-muted">+1 (415) 555-0132 · returning caller</p>
            </div>
            <PhoneIcon className="ml-auto h-4 w-4 text-accent" />
          </div>

          <div className="flex h-14 items-center justify-center gap-[3px] rounded-xl border border-border/70 bg-background/60 px-3">
            {WAVE_HEIGHTS.map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="wave-bar w-[3px] shrink-0 rounded-full bg-gradient-to-t from-accent/40 via-accent to-emerald-300"
                style={{
                  height: `${height}%`,
                  animationDelay: `${(index % 12) * 0.09}s`,
                }}
              />
            ))}
          </div>

          <div className="space-y-2.5 text-[12.5px] leading-relaxed">
            <p className="transcript-line max-w-[88%] rounded-2xl rounded-tl-sm bg-background px-3 py-2 text-muted">
              Hi — my water heater is leaking. Can anyone come out today?
            </p>
            <p
              className="transcript-line ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-accent px-3 py-2 text-accent-foreground"
              style={{ animationDelay: "0.9s" }}
            >
              I can get a technician to you between 2 and 4 this afternoon. Does
              that work?
            </p>
            <p
              className="transcript-line max-w-[70%] rounded-2xl rounded-tl-sm bg-background px-3 py-2 text-muted"
              style={{ animationDelay: "1.8s" }}
            >
              Yes — 2 o&apos;clock is perfect.
            </p>
          </div>

          <div
            className="transcript-line flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5"
            style={{ animationDelay: "2.6s" }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CalendarIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Appointment booked
              </p>
              <p className="truncate text-xs text-foreground">
                Today, 2:00–4:00 PM · Google Calendar
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-medium text-muted">
              <CalendarIcon className="h-3 w-3 text-accent" />
              Calendar synced
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-medium text-muted">
              <CrmIcon className="h-3 w-3 text-accent" />
              HubSpot contact
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-medium text-muted">
              <ClockIconMini />
              Answers in 1.2s
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-medium text-muted">
              <GlobeIconMini />
              24/7 coverage
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClockIconMini() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="h-3 w-3 text-accent"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  );
}

function GlobeIconMini() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="h-3 w-3 text-accent"
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17Z" />
    </svg>
  );
}
