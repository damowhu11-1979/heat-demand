/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',               // static export mode
  trailingSlash: true,            // so /rooms/ becomes /rooms/index.html
  basePath: isProd ? '/heat-demand' : '',
  assetPrefix: isProd ? '/heat-demand/' : undefined,
  // … other config
}

export default nextConfig;

