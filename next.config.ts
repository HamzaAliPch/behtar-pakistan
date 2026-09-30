import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.FRIEND_TEST_MODE === "1" ? ".next-friend-test" : process.env.AUTH_TEST_MODE === "1" ? ".next-auth-test" : ".next",
  experimental: { serverActions: { bodySizeLimit: "32mb", ...(process.env.FRIEND_TEST_MODE === "1" ? { allowedOrigins: ["test.socialautomation.my.id"] } : {}) } },
};

export default nextConfig;
