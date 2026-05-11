import type { MetadataRoute } from 'next'

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'

export default function robots(): MetadataRoute.Robots {
  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/account/', '/auth/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
