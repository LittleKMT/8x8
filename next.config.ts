import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPages ? "/8x8" : "",
  assetPrefix: isGitHubPages ? "/8x8/" : undefined,
};

export default nextConfig;
