import { MEDIA_VARIANT_KEYS } from '@/features/media/constants'

type MediaAssetLike = {
  url?: string
  alt_text?: string
}

type MediaSetLike = {
  alt_text?: string
  title?: string
  variants?: Record<string, unknown>
}

export const getMediaSetPreviewAsset = (mediaSet: MediaSetLike | null | undefined) => {
  const variants = mediaSet?.variants
  if (!variants || typeof variants !== 'object') return null

  for (const key of MEDIA_VARIANT_KEYS) {
    const variant = variants[key]
    if (!variant || typeof variant !== 'object') continue
    if ('url' in variant && typeof (variant as MediaAssetLike).url === 'string') {
      return variant as MediaAssetLike
    }
  }

  return null
}
