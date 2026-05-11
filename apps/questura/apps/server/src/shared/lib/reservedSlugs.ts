export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'admin',
  'dashboard',
  'login',
  'signup',
  'signin',
  'logout',
  'auth',
  'search',
  'sitemap',
  'robots',
  'rss',
  'feed',
  'page',
  'articles',
  'maps',
  'itineraries',
  'tags',
  'hotels',
  'restaurants',
  'assets',
  '_next',
  'media',
  'about',
  'contact',
  'privacy',
  'terms',
  'support',
  'create',
  'edit',
  'featured',
  'trending',
  'home',
  'index',
  'account',
  'profile',
  'settings',
  'users',
  'user',
  'static',
  'public',
  'images',
  'img',
  'og',
  'health',
  'status',
  'categories',
  'category',
  'cookies',
  'legal',
  'country',
  'city',
  'region',
  'continent',
  'preview',
  'draft',
  'drafts',
  'revalidate',
  'embed',
  'widget',
  'share',
  '404',
  '500',
  'manifest',
  'favicon',
])

export const RESERVED_LANG_PREFIXES: ReadonlySet<string> = new Set([
  'en',
  'es',
  'fr',
  'pt',
  'de',
  'it',
  'ja',
  'ko',
  'zh',
  'ru',
  'ar',
  'nl',
  'pl',
  'tr',
  'sv',
  'da',
  'fi',
  'no',
  'cs',
  'el',
  'he',
  'hi',
  'id',
  'th',
  'vi',
  'uk',
  'ro',
  'hu',
])

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export function validateSlugAgainstReserved(slug: unknown): true | string {
  if (typeof slug !== 'string' || slug.length === 0) {
    return 'slug is required'
  }

  if (!SLUG_PATTERN.test(slug)) {
    return 'slug must be kebab-case lowercase (a-z, 0-9, hyphen), no leading/trailing hyphen'
  }

  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    return `slug "${slug}" is reserved and cannot be used`
  }

  return true
}

export function validateCountrySlugAgainstReserved(slug: unknown): true | string {
  const base = validateSlugAgainstReserved(slug)
  if (base !== true) return base

  const normalized = String(slug).toLowerCase()
  if (RESERVED_LANG_PREFIXES.has(normalized)) {
    return `slug "${slug}" collides with a language prefix and cannot be used at the country level`
  }

  return true
}
