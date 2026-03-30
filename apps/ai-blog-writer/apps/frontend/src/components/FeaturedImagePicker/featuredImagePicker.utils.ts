import type { MediaAsset } from '../../features/staging/api/payload/payload.types'

export function getMediaSetId(
  mediaSet: MediaAsset['mediaSet'],
): string | number | null {
  if (mediaSet === null || mediaSet === undefined) return null
  if (typeof mediaSet === 'string' || typeof mediaSet === 'number') {
    return mediaSet
  }
  if (typeof mediaSet === 'object' && 'id' in mediaSet) {
    const mediaSetId = mediaSet.id
    if (typeof mediaSetId === 'string' || typeof mediaSetId === 'number') {
      return mediaSetId
    }
  }
  return null
}

export function hasMediaSet(
  asset: Pick<MediaAsset, 'mediaSet'> | null | undefined,
): boolean {
  return getMediaSetId(asset?.mediaSet) !== null
}

export function filterAssetsWithMediaSet<T extends Pick<MediaAsset, 'mediaSet'>>(
  assets: T[],
): T[] {
  return assets.filter((asset) => hasMediaSet(asset))
}
