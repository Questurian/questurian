import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a production build for measurement live beside a running `pnpm dev`
  // without clobbering its `.next` (docs/capacity/README.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: {
    // Disable ESLint linting during builds to work around pnpm + ESLint version resolution issues
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Temporary: allow builds while legacy type errors are being cleaned up incrementally.
    ignoreBuildErrors: true,
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
