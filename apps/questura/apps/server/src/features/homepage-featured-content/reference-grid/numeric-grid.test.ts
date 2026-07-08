import { describe, expect, it, vi } from 'vitest'

import {
  getNumericReferenceGridSelectionFromItems,
  validateNumericReferenceGridItems,
} from './numeric-grid'
import { normalizeNumericReferenceInput, parseNumericReferenceSlots } from './refs'

type Candidate = {
  id: number
  title: string
  status: string | null
  imageUrl: string | null
}

function config(docs: Map<number, Candidate>) {
  return {
    findDoc: vi.fn(async (_payload, ref: { id: number }) => docs.get(ref.id) ?? null),
    duplicateMessage: 'Grid cannot contain duplicates.',
    notFoundMessage: (ref: { id: number }) => `Doc #${ref.id} could not be found.`,
    unpublishedMessage: (candidate: Candidate) => `"${candidate.title}" is not published.`,
    missingImageMessage: (candidate: Candidate) => `"${candidate.title}" is missing an image.`,
  }
}

describe('reference-grid numeric helpers', () => {
  it('rejects invalid numeric refs before validation', () => {
    expect(() =>
      normalizeNumericReferenceInput([{ id: 1 }, { value: 'nope' }], 'numeric ids only'),
    ).toThrow('numeric ids only')
  })

  it('validates count, duplicates, published state, image readiness, and missing docs', async () => {
    const docs = new Map<number, Candidate>([
      [1, { id: 1, title: 'One', status: 'published', imageUrl: 'https://cdn/1.jpg' }],
      [2, { id: 2, title: 'Two', status: 'draft', imageUrl: 'https://cdn/2.jpg' }],
      [3, { id: 3, title: 'Three', status: 'published', imageUrl: null }],
    ])
    const grid = config(docs)

    await expect(
      validateNumericReferenceGridItems({} as never, [{ id: 1 }], { slotCount: 2 }, grid),
    ).rejects.toThrow('This block requires exactly 2 items.')

    await expect(
      validateNumericReferenceGridItems(
        {} as never,
        [{ id: 1 }, { id: 1 }],
        { slotCount: 2 },
        grid,
      ),
    ).rejects.toThrow('Grid cannot contain duplicates.')

    await expect(
      validateNumericReferenceGridItems({} as never, [{ id: 99 }], { slotCount: 1 }, grid),
    ).rejects.toThrow('Doc #99 could not be found.')

    await expect(
      validateNumericReferenceGridItems(
        {} as never,
        [{ id: 2 }],
        { slotCount: 1, allowDrafts: false },
        grid,
      ),
    ).rejects.toThrow('"Two" is not published.')

    await expect(
      validateNumericReferenceGridItems({} as never, [{ id: 3 }], { slotCount: 1 }, grid),
    ).rejects.toThrow('"Three" is missing an image.')

    await expect(
      validateNumericReferenceGridItems(
        {} as never,
        [{ id: 2 }],
        {
          slotCount: 1,
          allowDrafts: true,
        },
        grid,
      ),
    ).resolves.toEqual([{ id: 2 }])
  })

  it('returns invalid selection items for bad refs, missing docs, and unpublished docs', async () => {
    const docs = new Map<number, Candidate>([
      [1, { id: 1, title: 'One', status: 'published', imageUrl: 'https://cdn/1.jpg' }],
      [3, { id: 3, title: 'Three', status: 'draft', imageUrl: 'https://cdn/3.jpg' }],
    ])

    const selection = await getNumericReferenceGridSelectionFromItems(
      {} as never,
      [1, 'bad', 2, 3],
      { totalSlots: 4, allowDrafts: false },
      {
        findDoc: config(docs).findDoc,
        parseSlots: parseNumericReferenceSlots,
      },
    )

    expect(selection.items).toEqual([expect.objectContaining({ id: 1, slot: 1 })])
    expect(selection.invalidItems).toEqual([
      { slot: 2, reason: 'invalid_reference' },
      { slot: 3, id: 2, reason: 'not_found' },
      { slot: 4, id: 3, title: 'Three', reason: 'not_published' },
    ])
    expect(selection.isComplete).toBe(false)
  })
})
