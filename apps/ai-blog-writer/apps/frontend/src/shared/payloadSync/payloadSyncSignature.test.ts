import {
  buildDraftPayloadSyncSignature,
  normalizeNumberSet,
  normalizeText,
  sortKeysDeep,
  stableSerialize,
} from './payloadSyncSignature'

describe('payload sync signature canonicalization', () => {
  it('normalizes text and finite number sets', () => {
    expect(normalizeText('  title  ')).toBe('title')
    expect(normalizeText(null)).toBe('')
    expect(normalizeNumberSet([3, 1, 3, Number.NaN, Number.POSITIVE_INFINITY, '2'])).toEqual([1, 3])
    expect(normalizeNumberSet(null)).toEqual([])
  })

  it('sorts object keys recursively without changing array order', () => {
    expect(
      sortKeysDeep({
        z: [
          { b: 2, a: 1 },
          { d: 4, c: 3 },
        ],
        a: { y: 2, x: 1 },
      }),
    ).toEqual({
      a: { x: 1, y: 2 },
      z: [
        { a: 1, b: 2 },
        { c: 3, d: 4 },
      ],
    })
  })

  it('serializes equivalent object shapes to the same signature', () => {
    expect(stableSerialize({ z: 2, nested: { b: 2, a: 1 } })).toBe(stableSerialize({ nested: { a: 1, b: 2 }, z: 2 }))
  })

  it('builds a signature from only the comparable draft shape', () => {
    const first = {
      payloadId: 10,
      title: ' Draft title ',
      localOnlyUpdatedAt: '2026-07-25T00:00:00.000Z',
    }
    const second = {
      ...first,
      localOnlyUpdatedAt: '2026-07-26T00:00:00.000Z',
    }
    const buildComparableShape = (draft: typeof first) => ({
      title: normalizeText(draft.title),
    })

    expect(buildDraftPayloadSyncSignature(first, buildComparableShape)).toBe(
      buildDraftPayloadSyncSignature(second, buildComparableShape),
    )
  })
})
