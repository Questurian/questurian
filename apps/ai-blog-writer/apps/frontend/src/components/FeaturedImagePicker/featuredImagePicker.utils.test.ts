import { filterAssetsWithMediaSet, getMediaSetId, hasMediaSet } from './featuredImagePicker.utils'

describe('featuredImagePicker utils', () => {
  it('extracts media set ids from payload relationship shapes', () => {
    expect(getMediaSetId(17)).toBe(17)
    expect(getMediaSetId('42')).toBe('42')
    expect(getMediaSetId({ id: 9 })).toBe(9)
    expect(getMediaSetId({ id: '11' })).toBe('11')
    expect(getMediaSetId(null)).toBeNull()
    expect(getMediaSetId(undefined)).toBeNull()
  })

  it('detects whether an asset belongs to a media set', () => {
    expect(hasMediaSet({ mediaSet: 17 })).toBe(true)
    expect(hasMediaSet({ mediaSet: { id: '42' } })).toBe(true)
    expect(hasMediaSet({ mediaSet: null })).toBe(false)
    expect(hasMediaSet(undefined)).toBe(false)
  })

  it('filters orphan payload assets out of picker results', () => {
    const assets = [
      { id: 1, filename: 'legacy-wide.webp', mediaSet: null },
      { id: 2, filename: 'variant-wide.webp', mediaSet: 22 },
      { id: 3, filename: 'variant-editorial.webp', mediaSet: { id: '33' } },
    ]

    expect(filterAssetsWithMediaSet(assets)).toEqual([
      { id: 2, filename: 'variant-wide.webp', mediaSet: 22 },
      { id: 3, filename: 'variant-editorial.webp', mediaSet: { id: '33' } },
    ])
  })
})
