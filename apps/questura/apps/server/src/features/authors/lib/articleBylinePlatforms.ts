export const ARTICLE_BYLINE_PLATFORMS = [
  'instagram',
  'youtube',
  'website',
  'twitter',
  'facebook',
  'linkedin',
  'reddit',
  'patreon',
] as const

export type ArticleBylinePlatform = (typeof ARTICLE_BYLINE_PLATFORMS)[number]
