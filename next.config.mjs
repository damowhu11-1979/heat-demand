/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',           // static export for GH Pages
  trailingSlash: true,        // folders as pages (…/page/index.html)
  images: { unoptimized: true },
  basePath: isProd ? '/heat-demand' : '',
  assetPrefix: isProd ? '/heat-demand/' : undefined,
};

export default nextConfig;

