import { describe, expect, it, vi } from 'vitest'

import {
  parseAuthorFeatureCardsBodyField,
  parseAuthorFeatureDescriptionModeBodyField,
  parseAuthorFeatureExpertiseModeBodyField,
  parseAuthorFeatureSelectedExpertiseBodyField,
  validateAuthorFeatureCardImageSelections,
} from './fields'

describe('Author Feature fields', () => {
  it('accepts a custom description mode', () => {
    expect(parseAuthorFeatureDescriptionModeBodyField({ descriptionMode: 'custom' })).toEqual({
      ok: true,
      omit: false,
      value: 'custom',
    })
  })

  it('accepts a trimmed subset of profile expertise', () => {
    expect(
      parseAuthorFeatureSelectedExpertiseBodyField({
        selectedExpertise: [' Digital Nomad ', 'Digital Nomad', ''],
      }),
    ).toEqual({ ok: true, omit: false, value: [{ area: 'Digital Nomad' }] })
  })

  it('accepts selecting individual expertise labels', () => {
    expect(parseAuthorFeatureExpertiseModeBodyField({ expertiseMode: 'selected' })).toEqual({
      ok: true,
      omit: false,
      value: 'selected',
    })
  })

  it('accepts one Author with one explicitly selected image', () => {
    expect(
      parseAuthorFeatureCardsBodyField({
        authorCards: [
          {
            author: 3,
            image: 1101,
            spotlightNote: ' Local expat ',
          },
        ],
      }),
    ).toEqual({
      ok: true,
      omit: false,
      value: [
        {
          author: 3,
          image: 1101,
          spotlightNote: 'Local expat',
        },
      ],
    })
  })

  it('rejects more than one Author', () => {
    expect(
      parseAuthorFeatureCardsBodyField({
        authorCards: [
          { author: 3, image: 1101 },
          { author: 4, image: 2202 },
        ],
      }),
    ).toEqual({ ok: false, message: 'Author Feature supports exactly one Author.' })
  })

  it('rejects an empty Author selection', () => {
    expect(parseAuthorFeatureCardsBodyField({ authorCards: [] })).toEqual({
      ok: false,
      message: 'Author Feature supports exactly one Author.',
    })
  })

  it('rejects selecting an image not attached to that Author', async () => {
    const payload = {
      findByID: vi.fn(async () => ({
        authorImages: [{ mediaSet: { id: 1101 } }],
      })),
    }

    await expect(
      validateAuthorFeatureCardImageSelections(payload as never, [
        {
          author: 3,
          image: 2202,
          spotlightNote: null,
        },
      ]),
    ).resolves.toBe('Author Feature card 1 image must be one of that Author’s uploaded images.')
  })

  it('accepts the exact image attached to that Author', async () => {
    const payload = {
      findByID: vi.fn(async () => ({
        authorImages: [{ mediaSet: { id: 1101 } }],
      })),
    }

    await expect(
      validateAuthorFeatureCardImageSelections(payload as never, [
        {
          author: 3,
          image: 1101,
          spotlightNote: null,
        },
      ]),
    ).resolves.toBeNull()
  })
})
