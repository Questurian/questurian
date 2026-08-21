import {
  ARTICLE_BYLINE_PLATFORMS,
  type ArticleBylinePlatform,
} from '../../authors/lib/articleBylinePlatforms'

const BYLINE_PLATFORM_SET = new Set<string>(ARTICLE_BYLINE_PLATFORMS)

const SOCIAL_PLATFORMS = [
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
  'reddit',
  'youtube',
  'patreon',
  'website',
] as const

type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]
type SocialLinks = Record<SocialPlatform, string | null>

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function serializeAvatar(author: Record<string, unknown>) {
  const avatar = recordValue(author.avatar)
  if (!avatar) return null

  const url = stringValue(avatar.url) ?? stringValue(avatar.bunny_original_url)
  if (!url) return null

  return {
    url,
    alt: stringValue(avatar.alt_text) ?? stringValue(avatar.alt),
  }
}

function serializeSocialLinks(author: Record<string, unknown>): SocialLinks | null {
  const socialLinks = recordValue(author.socialLinks)
  if (!socialLinks) return null

  const links = Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [platform, stringValue(socialLinks[platform])]),
  ) as SocialLinks

  return SOCIAL_PLATFORMS.some((platform) => links[platform]) ? links : null
}

function serializeExpertise(author: Record<string, unknown>): string[] {
  if (!Array.isArray(author.expertise)) return []

  return author.expertise.flatMap((row) => {
    const area = stringValue(recordValue(row)?.area)
    return area ? [area] : []
  })
}

function serializeFeaturedLinks(
  author: Record<string, unknown>,
  featuredLinks: unknown,
): Array<{ platform: ArticleBylinePlatform; url: string }> {
  const socialLinks = recordValue(author.socialLinks)
  if (!socialLinks || !Array.isArray(featuredLinks)) return []

  return featuredLinks
    .filter(
      (platform): platform is ArticleBylinePlatform =>
        typeof platform === 'string' && BYLINE_PLATFORM_SET.has(platform),
    )
    .flatMap((platform) => {
      const url = stringValue(socialLinks[platform])
      return url ? [{ platform, url }] : []
    })
    .slice(0, 3)
}

/** Replace populated Payload Author data with article-page public view. */
export function serializeArticleAuthor(article: Record<string, unknown>): void {
  const author = recordValue(article.author)
  if (!author) return

  const articleByline = recordValue(author.articleByline)
  const avatar = serializeAvatar(author)

  article.author = {
    id: author.id,
    slug: stringValue(author.slug),
    displayName: stringValue(author.displayName) ?? 'Questurian',
    bio: stringValue(author.bio),
    expertise: serializeExpertise(author),
    avatar,
    socialLinks: serializeSocialLinks(author),
    articleByline: {
      avatar: articleByline?.showAvatar === true ? avatar : null,
      links: serializeFeaturedLinks(author, articleByline?.featuredLinks),
    },
  }
}
