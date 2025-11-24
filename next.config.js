/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',          // static export for GH Pages
  basePath: '/heat-demand',  // repo name
  assetPrefix: '/heat-demand/',
  trailingSlash: true,       // creates folder-style files
};
