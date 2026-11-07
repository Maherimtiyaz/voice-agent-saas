import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Public pages only. Login, registration, invite links, and the whole
 * dashboard are deliberately absent — they are not useful in search
 * results and are disallowed in robots.txt.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();

  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
