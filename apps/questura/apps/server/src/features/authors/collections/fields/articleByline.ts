import type { Field } from 'payload'

import {
  ARTICLE_BYLINE_PLATFORMS,
  type ArticleBylinePlatform,
} from '../../lib/articleBylinePlatforms'

const ARTICLE_BYLINE_PLATFORM_LABELS: Record<ArticleBylinePlatform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  website: 'Website',
  twitter: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  patreon: 'Patreon',
}

export const ARTICLE_BYLINE_PLATFORM_OPTIONS = ARTICLE_BYLINE_PLATFORMS.map((value) => ({
  label: ARTICLE_BYLINE_PLATFORM_LABELS[value],
  value,
}))

export function validateFeaturedBylineLinks(
  value: unknown,
  { data }: { data?: unknown } = {},
): true | string {
  if (!Array.isArray(value)) return true
  if (value.length > 3) return 'Choose no more than 3 featured byline links.'

  const socialLinks =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as { socialLinks?: Record<string, unknown> }).socialLinks
      : undefined

  for (const platform of value) {
    if (typeof platform !== 'string') continue
    const url = socialLinks?.[platform]
    if (typeof url !== 'string' || !url.trim()) {
      const label = ARTICLE_BYLINE_PLATFORM_OPTIONS.find((option) => option.value === platform)?.label
      return `Add a ${label ?? platform} URL under Social Links or remove it from featured byline links.`
    }
  }

  return true
}

export const articleByline: Field = {
  name: 'articleByline',
  type: 'group',
  admin: {
    description:
      'Optional presentation on articles. Author page still displays every configured social link.',
  },
  fields: [
    {
      name: 'showAvatar',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Show this Author’s existing avatar beside article bylines.',
      },
    },
    {
      name: 'featuredLinks',
      type: 'select',
      hasMany: true,
      options: [...ARTICLE_BYLINE_PLATFORM_OPTIONS],
      validate: validateFeaturedBylineLinks,
      admin: {
        description:
          'Choose up to 3 links for article bylines. A choice renders only when its Social Links URL is filled in.',
      },
    },
  ],
}
