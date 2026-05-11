import type { MetadataRoute } from 'next'
import { config } from '@/lib/config'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'

type SitemapEntry = {
  url: string
  lastModified: string | null
}

type SitemapEntriesResponse = {
  lang: string
  hubs: SitemapEntry[]
  indexes: SitemapEntry[]
  content: SitemapEntry[]
}

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = `${config.backendUrl}/api/public/sitemap-entries?lang=${DEFAULT_LOCALE}`
  let data: SitemapEntriesResponse | null = null

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (res.ok) data = (await res.json()) as SitemapEntriesResponse
  } catch {
    data = null
  }

  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')
  const home: MetadataRoute.Sitemap[number] = {
    url: `${base}/`,
    changeFrequency: 'daily',
    priority: 1.0,
  }

  if (!data) return [home]

  const toEntry = (entry: SitemapEntry, priority: number): MetadataRoute.Sitemap[number] => {
    const absolute = `${base}${entry.url.startsWith('/') ? '' : '/'}${entry.url}`
    return {
      url: absolute,
      lastModified: entry.lastModified ? new Date(entry.lastModified) : undefined,
      priority,
    }
  }

  return [
    home,
    ...data.hubs.map((entry) => toEntry(entry, 0.8)),
    ...data.indexes.map((entry) => toEntry(entry, 0.5)),
    ...data.content.map((entry) => toEntry(entry, 0.7)),
  ]
}
