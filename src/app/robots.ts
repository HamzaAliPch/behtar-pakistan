import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  if (process.env.FRIEND_TEST_MODE === "1" || process.env.PUBLIC_INDEXING_ENABLED !== "1") return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin/", "/city/", "/dashboard", "/profile", "/notifications", "/api/", "/volunteer/tasks/"] }, sitemap: process.env.PUBLIC_SITE_URL ? `${process.env.PUBLIC_SITE_URL.replace(/\/$/, "")}/sitemap.xml` : undefined };
}
