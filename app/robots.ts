import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Every authenticated area. The route group `(dashboard)` does
        // not appear in the URL, so these are the real paths.
        "/dashboard",
        "/agents",
        "/calls",
        "/campaigns",
        "/phone-numbers",
        "/analytics",
        "/settings",
        "/invite",
        // Auth screens are utility pages, not landing pages.
        "/login",
        "/register",
        // Machine endpoints: the public API, webhooks, cron, and the
        // lead inbox. None of these should be crawled.
        "/api/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
