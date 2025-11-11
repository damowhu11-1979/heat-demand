/** @type {import('next').NextConfig} */
const nextConfig = {
  // We publish as a static site (GitHub Pages)
  output: 'export',
  // Friendly folder-style URLs for Pages hosting:
  trailingSlash: true,
  // If you want absolute links like "/rooms" to work on GH Pages,
  // uncomment these two lines AND use absolute hrefs:
  // basePath: '/heat-demand',
  // assetPrefix: '/heat-demand/',
};

export default nextConfig;

