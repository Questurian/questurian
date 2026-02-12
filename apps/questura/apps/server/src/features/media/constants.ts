export const MEDIA_VARIANT_KEYS = [
  'thumbnail',
  'square',
  'wide',
  'portrait',
  'hero',
  'open_graph',
  'editorial',
] as const

export type MediaVariantKey = (typeof MEDIA_VARIANT_KEYS)[number]

export const MEDIA_VARIANT_OPTIONS = [
  { label: 'Thumbnail (3:2)', value: 'thumbnail' },
  { label: 'Square (1:1)', value: 'square' },
  { label: 'Wide (16:9)', value: 'wide' },
  { label: 'Portrait (4:5)', value: 'portrait' },
  { label: 'Hero (21:9)', value: 'hero' },
  { label: 'Open Graph / Social Share (1.91:1)', value: 'open_graph' },
  { label: 'Editorial / News Standard (4:3)', value: 'editorial' },
]
