// next.config.ts
import type { NextConfig } from 'next';

const isCI = process.env.GITHUB_ACTIONS === 'true';
// If your repo name ever changes, update this:
const repo = 'heat-demand';

const config: NextConfig = {
  output: 'export',            // <-- static export (replaces `next export`)
  images: { unoptimized: true },
  basePath: isCI ? `/${repo}` : undefined,
  assetPrefix: isCI ? `/${repo}/` : undefined,
};

export default config;
