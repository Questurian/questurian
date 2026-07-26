import { describe, expect, it } from 'vitest'
import { VARIANT_SEQUENCE, VARIANT_SPECS } from './image-variant-policy'

describe('image variant policy', () => {
  it('keeps upload order aligned with every supported variant', () => {
    expect(VARIANT_SEQUENCE).toEqual([
      'thumbnail',
      'square',
      'wide',
      'portrait',
      'hero',
      'open_graph',
      'editorial'
    ])
    expect(Object.keys(VARIANT_SPECS)).toEqual(VARIANT_SEQUENCE)
  })

  it('defines the expected output dimensions and aspect ratios', () => {
    for (const type of VARIANT_SEQUENCE) {
      const spec = VARIANT_SPECS[type]
      expect(spec.ratio).toBeCloseTo(spec.width / spec.height)
    }

    expect(VARIANT_SPECS.hero).toMatchObject({
      width: 2100,
      height: 900,
      label: '21:9'
    })
  })
})
