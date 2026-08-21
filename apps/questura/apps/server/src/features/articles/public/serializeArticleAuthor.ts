const BYLINE_PLATFORMS = [
  'instagram',
  'twitter',
  'facebook',
  'linkedin',
  'reddit',
  'youtube',
  'patreon',
  'website',
] as const

type BylinePlatform = (typeof BYLINE_PLATFORMS)[number]

const BYLINE_PLATFORM_SET = new Set<string>(BYLINE_PLATFORMS)

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function serializeAvatar(author: Record<string, unknown>, showAvatar: boolean) {
  if (!showAvatar) return null

  const avatar = recordValue(author.avatar)
  if (!avatar) return null

  const url = stringValue(avatar.url) ?? stringValue(avatar.bunny_original_url)
  if (!url) return null

  return {
    url,
    alt: stringValue(avatar.alt_text) ?? stringValue(avatar.alt),
  }
}

function serializeFeaturedLinks(
  author: Record<string, unknown>,
  featuredLinks: unknown,
): Array<{ platform: BylinePlatform; url: string }> {
  const socialLinks = recordValue(author.socialLinks)
  if (!socialLinks || !Array.isArray(featuredLinks)) return []

  return featuredLinks
    .filter(
      (platform): platform is BylinePlatform =>
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

  article.author = {
    id: author.id,
    slug: stringValue(author.slug),
    displayName: stringValue(author.displayName) ?? 'Questurian',
    articleByline: {
      avatar: serializeAvatar(author, articleByline?.showAvatar === true),
      links: serializeFeaturedLinks(author, articleByline?.featuredLinks),
    },
  }
}
