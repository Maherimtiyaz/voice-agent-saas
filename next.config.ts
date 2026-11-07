import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy.
 *
 * The app loads no third-party scripts, so script-src can stay on
 * 'self'. `'unsafe-inline'` is required because Next.js emits inline
 * bootstrap/hydration scripts and the root layout has a tiny inline
 * theme script that must run before first paint. A nonce-based policy
 * (the stronger option) needs every page to be dynamically rendered,
 * which would give up static rendering of the marketing pages — a
 * deliberate trade-off, not an oversight.
 *
 * `'unsafe-eval'` is only for the dev server's HMR runtime.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // The dev server's HMR socket is a plain ws:// connection; production
  // never needs one.
  `connect-src 'self' https:${isProduction ? "" : " ws: wss:"}`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Clickjacking: nobody may frame the dashboard (or anything else).
  { key: "X-Frame-Options", value: "DENY" },
  // Never let a browser guess a content type — the admin inbox renders
  // user-submitted text as HTML (escaped) and JSON is served from /api.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Only meaningful over HTTPS; adding it in dev would poison the
  // browser's HSTS cache for localhost.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Don't advertise the framework version to the internet.
  poweredByHeader: false,

  // SVG uploads to the image optimizer have been an RCE vector in
  // Next.js; this app serves no optimized images at all, so keep the
  // optimizer locked down rather than relying on the patch alone.
  images: {
    dangerouslyAllowSVG: false,
    remotePatterns: [],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Machine endpoints should never appear in search results, even
        // if a crawler ignores robots.txt.
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // The lead inbox is the one page that renders third-party
        // submitted text. It is also the page most likely to be opened
        // from a link in a chat, so never leak its URL onward.
        source: "/api/admin/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
