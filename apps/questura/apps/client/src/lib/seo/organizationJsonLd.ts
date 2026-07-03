const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? 'http://localhost:3000'

/**
 * Official Questura social profiles for the Organization `sameAs` links.
 * Add profile URLs here as they exist; `sameAs` is omitted while empty.
 */
const SOCIAL_PROFILE_URLS: string[] = []

export function buildOrganizationJsonLd(): Record<string, unknown> {
  const base = PUBLIC_BASE_URL.replace(/\/+$/, '')

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: 'Questura',
    url: `${base}/`,
    ...(SOCIAL_PROFILE_URLS.length > 0 ? { sameAs: SOCIAL_PROFILE_URLS } : {}),
  }
}
