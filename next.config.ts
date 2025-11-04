// next.config.ts
import type { NextConfig } from 'next';

const isCI = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  // tell Next to create `out/` on build — no `next export` needed
  output: 'export',
  images: { unoptimized: true },

  // for GitHub Pages under /heat-demand
  basePath: isCI ? '/heat-demand' : undefined,
  assetPrefix: isCI ? '/heat-demand/' : undefined,
};

export default nextConfig;
