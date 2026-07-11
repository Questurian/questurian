import { describe, expect, it } from 'vitest'
import type { MediaAsset } from '../../api/payload/payload.types'
import {
  filterAssetsWithMediaSet,
  formatMediaSetLabel,
  getMediaSetId,
  hasMediaSet,
  isMediaSetSelected,
  pickUploadedAssetId,
  resolveMediaSetPreviewAssetId,
  resolveMediaSetPreviewUrl,
} from './mediaSet.utils'

describe('mediaSet utils', () => {
  it('extracts media set ids from payload relationship shapes', () => {
    expect(getMediaSetId(17)).toBe(17)
    expect(getMediaSetId('42')).toBe('42')
    expect(getMediaSetId({ id: 9 } as MediaAsset['mediaSet'])).toBe(9)
    expect(getMediaSetId({ id: '11' } as MediaAsset['mediaSet'])).toBe('11')
    expect(getMediaSetId(null)).toBeNull()
    expect(getMediaSetId(undefined)).toBeNull()
  })

  it('detects whether an asset belongs to a media set', () => {
    expect(hasMediaSet({ mediaSet: 17 })).toBe(true)
    expect(hasMediaSet({ mediaSet: { id: '42' } } as Pick<MediaAsset, 'mediaSet'>)).toBe(true)
    expect(hasMediaSet({ mediaSet: null })).toBe(false)
    expect(hasMediaSet(undefined)).toBe(false)
  })

  it('filters orphan payload assets out of picker results', () => {
    const assets = [
      { id: 1, filename: 'legacy-wide.webp', mediaSet: null },
      { id: 2, filename: 'variant-wide.webp', mediaSet: 22 },
      { id: 3, filename: 'variant-editorial.webp', mediaSet: { id: '33' } },
    ] as unknown as MediaAsset[]

    expect(filterAssetsWithMediaSet(assets).map((a) => a.id)).toEqual([2, 3])
  })

  it('formats a media-set label from available metadata', () => {
    expect(
      formatMediaSetLabel({
        title: 'Barranco murals',
        location: 'Barranco, Lima',
        alt_text: 'Street art at sunset',
      }),
    ).toBe('Barranco murals · Barranco, Lima · Street art at sunset')
  })

  it('prefers a stable preview asset id from a media set', () => {
    expect(
      resolveMediaSetPreviewAssetId({
        variants: {
          editorial: { id: 41, filename: 'editorial.webp' },
          wide: { id: 42, filename: 'wide.webp' },
        },
      } as never),
    ).toBe(41)
  })

  it('matches media set selections by either set id or preview asset id', () => {
    const mediaSet = {
      id: 9,
      variants: {
        thumbnail: { id: 101, filename: 'thumbnail.webp' },
      },
    } as never

    expect(isMediaSetSelected(mediaSet, 9)).toBe(true)
    expect(isMediaSetSelected(mediaSet, 101)).toBe(true)
    expect(isMediaSetSelected(mediaSet, 102)).toBe(false)
    expect(isMediaSetSelected(mediaSet, null)).toBe(false)
  })

  it('adds a variant asset cache key to media-set preview URLs', () => {
    expect(
      resolveMediaSetPreviewUrl({
        variants: {
          thumbnail: { id: 101, filename: 'thumbnail.webp', updatedAt: '2026-07-11T00:00:00.000Z' },
        },
      } as never),
    ).toBe(
      'http://localhost:4000/api/media-assets/file/thumbnail.webp?v=2026-07-11T00%3A00%3A00.000Z',
    )

    expect(
      resolveMediaSetPreviewUrl({
        variants: {
          thumbnail: { id: 102, url: '/api/media-assets/file/thumbnail.webp' },
        },
      } as never),
    ).toBe('/api/media-assets/file/thumbnail.webp?v=102')
  })

  it('picks the preferred variant asset id from an upload response, falling back to any', () => {
    expect(
      pickUploadedAssetId({ variantAssetIds: { wide: '202', editorial: '203' } } as never, 'wide'),
    ).toBe(202)
    expect(
      pickUploadedAssetId({ variantAssetIds: { editorial: '203' } } as never, 'wide'),
    ).toBe(203)
    expect(pickUploadedAssetId({ variantAssetIds: undefined } as never, 'wide')).toBeNull()
  })
})
