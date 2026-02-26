import type {
  GalleryImageObject,
  GalleryMediaAsset,
  InstagramPostOption,
  MediaAssetOption,
  MediaMode,
  RelatedItemOption,
} from '../../types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

/** Variant keys to try in order of preference when resolving a display URL from a MediaSet */
const PREFERRED_VARIANTS = ['thumbnail', 'square', 'editorial', 'wide', 'portrait'] as const

/**
 * Resolves a displayable image URL from either a GalleryImageObject (MediaSet from depth=2)
 * or a MediaAssetOption. For MediaSets, walks the variants in preference order.
 */
export function resolveImageUrl(asset: GalleryImageObject | MediaAssetOption): string | undefined {
  // MediaSet path: look inside variants (depth=2 expansion)
  if ('variants' in asset && asset.variants) {
    for (const key of PREFERRED_VARIANTS) {
      const variant = (asset.variants as Record<string, unknown>)[key]
      if (variant && typeof variant === 'object') {
        const v = variant as GalleryMediaAsset
        if (v.url) return v.url
        if (v.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${v.filename}`
      }
    }
    return undefined
  }

  // MediaAsset path: direct url/filename (MediaAssetOption shape)
  const direct = asset as MediaAssetOption
  if (direct.url) return direct.url
  if (direct.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${direct.filename}`
  return undefined
}

export function getRelatedPhotoObjects(item: RelatedItemOption | null | undefined): GalleryImageObject[] {
  if (!item?.gallery?.length) return []

  const seen = new Set<number>()
  const result: GalleryImageObject[] = []

  for (const entry of item.gallery) {
    const image = entry?.image
    if (!image) continue

    if (typeof image === 'number') {
      // Bare ID (depth=0 fallback) — no URL available
      if (!seen.has(image)) {
        seen.add(image)
        result.push({ id: image })
      }
    } else if (typeof image === 'object' && image !== null && typeof image.id === 'number') {
      if (!seen.has(image.id)) {
        seen.add(image.id)
        result.push(image as GalleryImageObject)
      }
    }
  }

  return result
}

export function getRelationshipId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number' && Number.isFinite(id)) return id
  }
  return null
}

export function getRelationshipIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<number>()
  const ids: number[] = []

  for (const entry of value) {
    const id = getRelationshipId(entry)
    if (id === null || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }

  return ids
}

export function isMediaMode(value: unknown): value is MediaMode {
  return value === 'photos' || value === 'instagram' || value === 'both'
}

export function requiresPhotos(mode: MediaMode): boolean {
  return mode === 'photos' || mode === 'both'
}

export function requiresInstagram(mode: MediaMode): boolean {
  return mode === 'instagram' || mode === 'both'
}

export function getRelatedPhotoIds(item: RelatedItemOption | null | undefined): number[] {
  if (!item?.gallery?.length) return []
  return getRelationshipIds(item.gallery.map((entry) => entry?.image))
}

export function getRelatedInstagramPostIds(item: RelatedItemOption | null | undefined): number[] {
  if (!item?.instagramGallery?.length) return []
  return getRelationshipIds(item.instagramGallery.map((entry) => entry?.post))
}

export function getRelatedInstagramPostObjects(item: RelatedItemOption | null | undefined): InstagramPostOption[] {
  if (!item?.instagramGallery?.length) return []

  const seen = new Set<number>()
  const result: InstagramPostOption[] = []

  for (const entry of item.instagramGallery) {
    const post = entry?.post
    if (!post) continue

    if (typeof post === 'number') {
      if (!seen.has(post)) {
        seen.add(post)
        result.push({ id: post, title: `Post #${post}` })
      }
    } else if (typeof post === 'object' && post !== null && typeof post.id === 'number') {
      if (!seen.has(post.id)) {
        seen.add(post.id)
        result.push(post as InstagramPostOption)
      }
    }
  }

  return result
}

export function resolveInstagramPreviewUrl(post: InstagramPostOption): string | undefined {
  const img = post.previewImage
  if (!img || typeof img === 'number') return undefined
  if (img.url) return img.url
  if (img.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${img.filename}`
  return undefined
}
