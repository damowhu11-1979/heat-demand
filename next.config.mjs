// next.config.mjs
const isProd =
  process.env.NODE_ENV === 'production' ||
  process.env.GITHUB_ACTIONS === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export a fully static site for GitHub Pages
  output: 'export',

  // So routes resolve as .../page/ (required by GH Pages hosting)
  trailingSlash: true,

  // Your project is served at https://<user>.github.io/heat-demand/
  // basePath and assetPrefix make all <Link href="/..."> work automatically.
  basePath: isProd ? '/heat-demand' : '',
  assetPrefix: isProd ? '/heat-demand/' : '',

  // Optional, but removes image optimizer that doesn’t run on static export
  images: { unoptimized: true },

  // Optional, keeps CI green if you don't want ESLint to block builds
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
