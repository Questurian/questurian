import type { MetadataRoute } from 'next'
import { getPublicBaseUrl } from '@/lib/seo/publicBaseUrl'

const PUBLIC_BASE_URL = getPublicBaseUrl()

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
