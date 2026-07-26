export type ImageVariantType =
  | 'thumbnail'
  | 'square'
  | 'wide'
  | 'portrait'
  | 'hero'
  | 'open_graph'
  | 'editorial'

export interface VariantSpec {
  width: number
  height: number
  ratio: number
  label: string
}

export const VARIANT_SPECS: Record<ImageVariantType, VariantSpec> = {
  thumbnail: { width: 1200, height: 800, ratio: 3 / 2, label: '3:2' },
  square: { width: 1080, height: 1080, ratio: 1, label: '1:1' },
  wide: { width: 1920, height: 1080, ratio: 16 / 9, label: '16:9' },
  portrait: { width: 1200, height: 1500, ratio: 4 / 5, label: '4:5' },
  hero: { width: 2100, height: 900, ratio: 21 / 9, label: '21:9' },
  open_graph: {
    width: 1200,
    height: 630,
    ratio: 1200 / 630,
    label: 'Open Graph (1.91:1)'
  },
  editorial: {
    width: 1600,
    height: 1200,
    ratio: 4 / 3,
    label: 'Editorial (4:3)'
  }
}

export const VARIANT_SEQUENCE: ImageVariantType[] = [
  'thumbnail',
  'square',
  'wide',
  'portrait',
  'hero',
  'open_graph',
  'editorial'
]
