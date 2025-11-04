// next.config.ts  (root)
import type { NextConfig } from 'next';

const isCI = process.env.GITHUB_ACTIONS === 'true';
const repo = 'heat-demand'; // change if your repo name differs

const config: NextConfig = {
  output: 'export',            // Next 16+ static export
  images: { unoptimized: true },
  basePath: isCI ? `/${repo}` : undefined,
  assetPrefix: isCI ? `/${repo}/` : undefined,
};

export default config;
