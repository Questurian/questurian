import { describe, expect, it } from 'vitest'
import { listicleItineraryStopBlocks, listicleItineraryWhereStayingBlocks } from './index'
import { ITINERARY_MOMENT_OPTIONS } from './utils/momentFields'

function fieldNames(block: (typeof listicleItineraryStopBlocks)[number]): string[] {
  return block.fields
    .filter((field): field is typeof field & { name: string } => 'name' in field)
    .map((field) => field.name)
}

describe('itinerary stop moment fields', () => {
  it('offers every approved itinerary moment', () => {
    expect(ITINERARY_MOMENT_OPTIONS.map((option) => option.value)).toEqual([
      'breakfast',
      'coffee',
      'morning-walk',
      'remote-work',
      'coworking-stop',
      'lunch',
      'street-food',
      'sweet-treat',
      'culture',
      'historic-site',
      'museum-visit',
      'landmark',
      'guided-tour',
      'local-market',
      'shopping',
      'outdoor',
      'beach-time',
      'scenic-viewpoint',
      'wellness-break',
      'active-adventure',
      'boat-ride',
      'day-trip',
      'in-transit',
      'sunset',
      'rooftop-stop',
      'dinner',
      'cocktails',
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
