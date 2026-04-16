import type { ExternalImageProvider } from '../../api'
import type {
  BlockImageModalMode,
  EditorModelName,
  ImgTrioFormat,
  MediaVariant,
  SupportedEditorialComponent,
} from './types'

export const CONTENT_BLOCK_VARIANT: MediaVariant = 'wide'
export const IMG_BLOCK_VARIANT: MediaVariant = 'portrait'
export const FEATURED_IMAGE_VARIANT: MediaVariant = 'editorial'
export const CONTENT_BLOCK_WIDTH = 1920
export const CONTENT_BLOCK_HEIGHT = 1080
export const FEATURED_IMAGE_WIDTH = 1600
export const FEATURED_IMAGE_HEIGHT = 1200
export const UPLOAD_LOCATION_REQUIREMENT_MESSAGE =
  'Select a valid location before uploading new images.'
export const IMG_BLOCK_MIN_WIDTH = 1200
export const IMG_BLOCK_MIN_HEIGHT = 1500
export const IMG_PAIR_REQUIRED_IMAGE_COUNT = 2
export const IMG_TRIO_REQUIRED_IMAGE_COUNT = 3
export const IMG_TRIO_DEFAULT_FORMAT: ImgTrioFormat = 'square'
export const DEFAULT_EDITOR_MODEL_NAME: EditorModelName = 'gemini-2.5-flash'

export const EDITOR_MODEL_OPTIONS: Array<{ value: EditorModelName; label: string }> = [
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview — best quality)' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview — fast & cheap)' },
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (Preview — multimodal)' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
]

export const IMG_TRIO_DIMENSIONS: Record<ImgTrioFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
}

export const EXTERNAL_MASONRY_BREAKPOINTS: Record<string, number> = {
  default: 5,
  1900: 4,
  1500: 3,
  1100: 2,
  700: 1,
}

export const EXTERNAL_PROVIDER_LABEL: Record<ExternalImageProvider, string> = {
  unsplash: 'Unsplash',
  pexels: 'Pexels',
}

export const VARIANT_FALLBACK_ORDER: MediaVariant[] = [
  'wide',
  'hero',
  'square',
  'portrait',
  'thumbnail',
]

export const KEY_TAKEAWAYS_COMPONENT = 'key_takeaways_box'
export const KEY_TAKEAWAYS_LABEL = 'Key Takeaways'
export const PULL_QUOTE_COMPONENT = 'pull_quote'
export const PULL_QUOTE_LABEL = 'Pull Quote'
export const IN_THE_KNOW_COMPONENT = 'in_the_know_box'
export const IN_THE_KNOW_LABEL = 'In The Know'
export const HIGHLIGHT_CALLOUT_COMPONENT = 'highlight_callout'
export const HIGHLIGHT_CALLOUT_LABEL = 'Highlight Callout'
export const FAQ_COMPONENT = 'faq_block'
export const FAQ_LABEL = 'FAQ'
export const EDITORIAL_MAX_TAKEAWAYS = 5
export const EDITORIAL_MAX_FAQ_ITEMS = 5

export const IMAGE_PICKER_OPTIONS: ReadonlyArray<{
  mode: BlockImageModalMode
  label: string
  hint: string
}> = [
  {
    mode: 'default',
    label: 'Single Image',
    hint: `wide | ${CONTENT_BLOCK_WIDTH}x${CONTENT_BLOCK_HEIGHT} | 16:9`,
  },
  {
    mode: 'img',
    label: 'Img Pair (2)',
    hint: `portrait | ${IMG_BLOCK_MIN_WIDTH}x${IMG_BLOCK_MIN_HEIGHT} | 4:5 each`,
  },
  {
    mode: 'img-trio',
    label: 'Img Trio (3)',
    hint: `square ${IMG_TRIO_DIMENSIONS.square.width}x${IMG_TRIO_DIMENSIONS.square.height} (1:1) or wide ${IMG_TRIO_DIMENSIONS.landscape.width}x${IMG_TRIO_DIMENSIONS.landscape.height} (16:9)`,
  },
]

export const EDITORIAL_PICKER_OPTIONS: ReadonlyArray<{
  component: SupportedEditorialComponent
  label: string
}> = [
  { component: PULL_QUOTE_COMPONENT, label: 'Quote' },
  { component: KEY_TAKEAWAYS_COMPONENT, label: 'Key Takeaways' },
  { component: IN_THE_KNOW_COMPONENT, label: 'In The Know' },
  { component: HIGHLIGHT_CALLOUT_COMPONENT, label: 'Highlight Callout' },
  { component: FAQ_COMPONENT, label: 'FAQ' },
]

export function getEditorialComponentDefaultLabel(component: string): string {
  if (component === PULL_QUOTE_COMPONENT) return PULL_QUOTE_LABEL
  if (component === KEY_TAKEAWAYS_COMPONENT) return KEY_TAKEAWAYS_LABEL
  if (component === IN_THE_KNOW_COMPONENT) return IN_THE_KNOW_LABEL
  if (component === HIGHLIGHT_CALLOUT_COMPONENT) return HIGHLIGHT_CALLOUT_LABEL
  if (component === FAQ_COMPONENT) return FAQ_LABEL
  return 'Editorial Block'
}

export function resolveEditorModelName(value?: string): EditorModelName {
  if (value === 'gemini-3.1-pro-preview') return value
  if (value === 'gemini-3.1-flash-lite-preview') return value
  if (value === 'gemini-3.1-flash-image-preview') return value
  if (value === 'gemini-2.5-flash') return value
  if (value === 'gemini-2.5-pro') return value
  if (value === 'gemini-2.0-flash') return value
  return DEFAULT_EDITOR_MODEL_NAME
}
