import { describe, expect, it } from 'vitest'

import {
  buildGeneratedVariantFilename,
  buildMediaSetCreateData,
  buildVariantGenerationPlan,
  getMediaSetStatus,
  getRequiredVariantsForPublicUse,
  inferAssetVariant,
  pickSourceUrl,
} from './finish-media-set-migration'

describe('finish media set migration helpers', () => {
  it('calculates coarse media set status from variants', () => {
    expect(getMediaSetStatus(null)).toBe('empty')
    expect(getMediaSetStatus({ wide: 10 })).toBe('partial')
    expect(getMediaSetStatus({ thumbnail: 10 })).toBe('usable')
  })

  it('copies safe metadata when creating a media set from an asset', () => {
    expect(
      buildMediaSetCreateData({
        filename: 'lima.webp',
        alt_text: 'Lima coast',
        photographer_credit: 'Ana',
        location: 'peru|lima',
        locationRef: { id: 44 },
        location_finalized: true,
        tags: [1, { id: 2 }],
      }),
    ).toEqual({
      title: 'Lima coast',
      alt_text: 'Lima coast',
      photographer_credit: 'Ana',
      location: 'peru|lima',
      locationRef: 44,
      location_finalized: true,
      tags: [1, { id: 2 }],
    })
  })

  it('omits absent metadata from media set create data', () => {
    expect(buildMediaSetCreateData({ filename: 'lima.webp' })).toEqual({
      title: 'lima.webp',
    })
  })

  it('infers common variants from dimensions when legacy asset has no variant', () => {
    expect(inferAssetVariant({ width: 1200, height: 1200 })).toBe('square')
    expect(inferAssetVariant({ width: 1200, height: 630 })).toBe('open_graph')
    expect(inferAssetVariant({ width: 1600, height: 900 })).toBe('wide')
    expect(inferAssetVariant({ width: 1200, height: 800 })).toBe('thumbnail')
    expect(inferAssetVariant({ width: 1200, height: 1500 })).toBe('portrait')
  })

  it('requires every curated article placement variant during migration', () => {
    expect(getRequiredVariantsForPublicUse({ publicUse: 'card-visual' })).toEqual(['thumbnail'])
    expect(getRequiredVariantsForPublicUse({ publicUse: 'article-header' })).toEqual([
      'thumbnail',
      'square',
      'wide',
      'hero',
    ])
    expect(
      getRequiredVariantsForPublicUse({ publicUse: 'article-header', hasSeoImage: true }),
    ).toEqual(['thumbnail', 'square', 'wide', 'hero', 'open_graph'])
  })

  it('plans only missing generated variants from best source asset', () => {
    const plan = buildVariantGenerationPlan({
      mediaSet: {
        variants: {
          thumbnail: { id: 7, url: 'https://cdn.example/thumb.webp' },
        },
      },
      required: ['thumbnail', 'wide', 'open_graph'],
    })

    expect(plan.missing).toEqual(['wide', 'open_graph'])
    expect(plan.sourceAsset?.id).toBe(7)
    expect(plan.generated.map((variant) => variant.variant)).toEqual(['wide', 'open_graph'])
  })

  it('uses direct asset source URL before legacy bunny URL', () => {
    expect(
      pickSourceUrl({
        url: 'https://cdn.example/current.webp',
        bunny_original_url: 'https://cdn.example/legacy.webp',
      }),
    ).toBe('https://cdn.example/current.webp')
  })

  it('builds stable generated variant filenames', () => {
    expect(buildGeneratedVariantFilename({ id: 3, filename: 'lima.jpg' }, 'thumbnail')).toBe(
      'lima-thumbnail.webp',
    )
  })
})
