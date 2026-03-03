import type {
  GalleryImageObject,
  GalleryMediaAsset,
  InstagramPostOption,
  MediaAssetOption,
  MediaMode,
  RelatedItemOption,
} from '../../types'

const PAYLOAD_API_URL = import.meta.env.VITE_PAYLOAD_API_URL || 'http://localhost:4000'

const PREFERRED_VARIANTS = ['thumbnail', 'square', 'editorial', 'wide', 'portrait'] as const

export function resolveImageUrl(asset: GalleryImageObject | MediaAssetOption): string | undefined {
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

function normalizeInstagramPermalink(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const withProtocol = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
  if (!/^https?:\/\//i.test(withProtocol)) return undefined

  try {
    const url = new URL(withProtocol)
    if (!/instagram\.com$/i.test(url.hostname) && !/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ''))) {
      return undefined
    }

    const cleanedPath = url.pathname.replace(/\/+$/, '')
    if (!cleanedPath) return undefined
    return `${url.origin}${cleanedPath}/`
  } catch {
    return undefined
  }
}

function extractPermalinkFromEmbedCode(embedCode: string | null | undefined): string | undefined {
  if (!embedCode || typeof embedCode !== 'string') return undefined

  const permalinkMatch = embedCode.match(/data-instgrm-permalink="([^"]+)"/i)
  if (permalinkMatch?.[1]) {
    const normalized = normalizeInstagramPermalink(permalinkMatch[1])
    if (normalized) return normalized
  }

  const hrefMatch = embedCode.match(/href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i)
  if (hrefMatch?.[1]) {
    const normalized = normalizeInstagramPermalink(hrefMatch[1])
    if (normalized) return normalized
  }

  return undefined
}

export function resolveInstagramPermalink(post: InstagramPostOption): string | undefined {
  const directCandidates = [
    post.permalink,
    post.url,
    post.instagramUrl,
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeInstagramPermalink(candidate)
    if (normalized) return normalized
  }

  if (post.shortcode && post.shortcode.trim()) {
    return `https://www.instagram.com/p/${post.shortcode.trim()}/`
  }

  return extractPermalinkFromEmbedCode(post.embedCode)
}

export function resolveInstagramEmbedUrl(post: InstagramPostOption): string | undefined {
  const permalink = resolveInstagramPermalink(post)
  if (!permalink) return undefined
  return `${permalink}embed/`
}
