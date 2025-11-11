// next.config.mjs
const isGhPages = process.env.GITHUB_PAGES === 'true';

// If you publish at https://<user>.github.io/heat-demand
// basePath/assetPrefix must be '/heat-demand'.
const ghBase = '/heat-demand';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',          // static export -> out/
  trailingSlash: true,       // ensures /rooms/ -> rooms/index.html
  basePath: isGhPages ? ghBase : '',
  assetPrefix: isGhPages ? `${ghBase}/` : '',
};

export default config;
