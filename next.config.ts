import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a small, self-contained Linux artifact for cPanel only when requested.
  output: process.env.CPANEL_STANDALONE_BUILD === "1" ? "standalone" : undefined,
  // Dynamic private paths must never be pulled into standalone output tracing.
  outputFileTracingExcludes: process.env.CPANEL_STANDALONE_BUILD === "1" ? {
    "/*": ["./runtime/**/*", "./private_uploads/**/*", "./prisma/*.db*", "./prisma/backups/**/*", "./.env*", "./.next-friend-test/**/*", "./.next-auth-test/**/*"],
  } : undefined,
  distDir: process.env.FRIEND_TEST_MODE === "1" ? ".next-friend-test" : process.env.AUTH_TEST_MODE === "1" ? ".next-auth-test" : ".next",
  experimental: { serverActions: { bodySizeLimit: "32mb", ...(process.env.FRIEND_TEST_MODE === "1" ? { allowedOrigins: ["test.socialautomation.my.id"] } : {}) } },
};

export default nextConfig;
