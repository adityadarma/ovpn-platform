import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // CSR: output as static HTML/JS/CSS files (no Node.js server needed)
  output: 'export',
  // Required for static export: disable image optimization (needs server)
  images: { unoptimized: true },
  // Static export doesn't support trailing slash by default
  trailingSlash: true,
}

export default nextConfig
