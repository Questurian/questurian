export const MEDIA_VARIANT_KEYS = [
  'thumbnail',
  'square',
  'wide',
  'portrait',
  'hero',
] as const

export type MediaVariantKey = (typeof MEDIA_VARIANT_KEYS)[number]

export const MEDIA_VARIANT_OPTIONS = [
  { label: 'Thumbnail (3:2)', value: 'thumbnail' },
  { label: 'Square (1:1)', value: 'square' },
  { label: 'Wide (16:9)', value: 'wide' },
  { label: 'Portrait (4:5)', value: 'portrait' },
  { label: 'Hero (21:9)', value: 'hero' },
]
