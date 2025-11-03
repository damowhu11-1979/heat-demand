/** @type {import('next').NextConfig} */
const isCI = process.env.GITHUB_ACTIONS === 'true';
const repo = 'heat-demand';
export default {
  output: 'export',
  images: { unoptimized: true },
  basePath: isCI ? `/${repo}` : undefined,
  assetPrefix: isCI ? `/${repo}/` : undefined,
};
