import { describe, expect, it } from 'vitest'
import {
  getRelatedItemDisplayLabel,
  normalizeRelatedItems,
} from './normalizeRelatedItems'

describe('normalizeRelatedItems', () => {
  it('falls back to nested names and humanizes raw location keys', () => {
    expect(normalizeRelatedItems([
      {
        id: 101,
        title: '   ',
        location: 'peru|lima|barranco',
      },
      {
        id: 202,
        title: '',
        location: '',
        core: {
          name: 'Puente de los Suspiros',
        },
      } as {
        id: number
        title: string
        location?: string
        core: {
          name: string
        }
      },
    ])).toEqual([
      {
        id: 101,
        title: 'Peru > Lima > Barranco',
        location: 'Peru > Lima > Barranco',
      },
      {
        id: 202,
        title: 'Puente de los Suspiros',
        location: '',
        core: {
          name: 'Puente de los Suspiros',
        },
      },
    ])
  })

  it('returns a non-empty display label even when the title is blank', () => {
    expect(getRelatedItemDisplayLabel({
      id: 7,
      title: '',
      location: 'peru|lima',
    })).toBe('Peru > Lima')

    expect(getRelatedItemDisplayLabel({
      id: 8,
      title: '',
      location: '',
    })).toBe('Item #8')
  })
})
