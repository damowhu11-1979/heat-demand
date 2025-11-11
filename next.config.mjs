// next.config.mjs
const isGhPages = process.env.GITHUB_PAGES === 'true';
const ghBase = '/heat-demand'; // <--- your repo name here

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  basePath: isGhPages ? ghBase : '',
  assetPrefix: isGhPages ? `${ghBase}/` : '',
};

export default config;
