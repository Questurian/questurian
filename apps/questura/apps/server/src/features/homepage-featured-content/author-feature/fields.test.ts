import { describe, expect, it, vi } from 'vitest'

import {
  parseAuthorFeatureCardsBodyField,
  validateAuthorFeatureCardImageSelections,
} from './fields'

describe('Author Feature fields', () => {
  it('accepts one Author with one explicitly selected image', () => {
    expect(
      parseAuthorFeatureCardsBodyField({
        authorCards: [
          {
            author: 3,
            image: 1101,
            spotlightNote: ' Local expat ',
            isEmphasized: true,
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
          isEmphasized: true,
        },
      ],
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
          isEmphasized: true,
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
          isEmphasized: true,
        },
      ]),
    ).resolves.toBeNull()
  })
})
