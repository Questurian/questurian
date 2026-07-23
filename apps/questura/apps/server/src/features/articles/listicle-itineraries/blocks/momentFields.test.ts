import { describe, expect, it } from 'vitest'
import { listicleItineraryStopBlocks, listicleItineraryWhereStayingBlocks } from './index'
import { ITINERARY_MOMENT_OPTIONS } from './utils/momentFields'

function fieldNames(block: (typeof listicleItineraryStopBlocks)[number]): string[] {
  return block.fields
    .filter((field): field is typeof field & { name: string } => 'name' in field)
    .map((field) => field.name)
}

describe('itinerary stop moment fields', () => {
  it('offers the twelve approved moments', () => {
    expect(ITINERARY_MOMENT_OPTIONS.map((option) => option.value)).toEqual([
      'breakfast',
      'coffee',
      'lunch',
      'sweet-treat',
      'culture',
      'landmark',
      'shopping',
      'outdoor',
      'sunset',
      'dinner',
      'drinks',
      'nightlife',
    ])
  })

  it('adds optional moment fields to every stop block but not lodging', () => {
    for (const block of listicleItineraryStopBlocks) {
      expect(fieldNames(block)).toEqual(expect.arrayContaining(['moment', 'momentLabel']))
    }

    expect(fieldNames(listicleItineraryWhereStayingBlocks[0])).not.toContain('moment')
    expect(fieldNames(listicleItineraryWhereStayingBlocks[0])).not.toContain('momentLabel')
  })
})
