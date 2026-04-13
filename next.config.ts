import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "better-sqlite3", "archiver"],
};

export default nextConfig;
