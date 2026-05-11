import { notFound } from 'next/navigation'
import { ARTICLE_TYPE_SEGMENTS, RESERVED_SLUGS } from '@/lib/reservedSlugs'
import { SUPPORTED_LOCALES_SET } from '@/lib/i18n/locales'

export function guardCountrySegment(value: string): void {
  const normalized = value.toLowerCase()
  if (SUPPORTED_LOCALES_SET.has(normalized)) return
  if (ARTICLE_TYPE_SEGMENTS.has(normalized) || RESERVED_SLUGS.has(normalized)) {
    notFound()
  }
}

export function guardCitySegment(value: string): void {
  const normalized = value.toLowerCase()
  if (ARTICLE_TYPE_SEGMENTS.has(normalized) || RESERVED_SLUGS.has(normalized)) {
    notFound()
  }
}

export function guardArticleSlug(value: string): void {
  const normalized = value.toLowerCase()
  if (ARTICLE_TYPE_SEGMENTS.has(normalized) || RESERVED_SLUGS.has(normalized)) {
    notFound()
  }
}
