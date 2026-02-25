import type { MediaMode, RelatedItemOption } from '../../types'

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
