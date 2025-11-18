 /** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isProd ? '/heat-demand' : '',
  assetPrefix: isProd ? '/heat-demand/' : undefined,
};

export default nextConfig;

