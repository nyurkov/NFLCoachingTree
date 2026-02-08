import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/NFLCoachingTree" : "",
  assetPrefix: isProd ? "/NFLCoachingTree/" : "",
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/NFLCoachingTree" : "",
  },
};

export default nextConfig;
