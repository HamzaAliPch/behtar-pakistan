import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const raw = process.env.PUBLIC_SITE_URL;
  if (process.env.FRIEND_TEST_MODE === "1" || process.env.PUBLIC_INDEXING_ENABLED !== "1" || !raw) return [];
  let base: URL;
  try { base = new URL(raw); } catch { return []; }
  if (base.protocol !== "https:" || base.hostname === "test.socialautomation.my.id") return [];
  return ["/", "/cities", "/map", "/projects", "/funds", "/help"].map(path => ({ url: new URL(path, base).toString(), changeFrequency: "weekly" as const }));
}
