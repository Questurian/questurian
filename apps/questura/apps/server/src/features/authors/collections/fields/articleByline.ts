import type { Field } from 'payload'

export const ARTICLE_BYLINE_PLATFORM_OPTIONS = [
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Website', value: 'website' },
  { label: 'X', value: 'twitter' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Reddit', value: 'reddit' },
  { label: 'Patreon', value: 'patreon' },
] as const

export function validateFeaturedBylineLinks(value: unknown): true | string {
  if (!Array.isArray(value) || value.length <= 3) return true
  return 'Choose no more than 3 featured byline links.'
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
