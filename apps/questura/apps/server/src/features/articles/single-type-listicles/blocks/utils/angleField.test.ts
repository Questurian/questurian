import { describe, expect, it } from 'vitest'
import { angleField } from './angleField'

describe('single-type listicle angle field', () => {
  it('accepts every angle emitted by the AI Blog Writer', () => {
    expect(angleField.type).toBe('select')
    if (angleField.type !== 'select') return

    expect(
      angleField.options.map((option) => (typeof option === 'string' ? option : option.value)),
    ).toEqual([
      'signature-dish',
      'atmosphere',
      'founders-backstory',
      'insider-tip',
      'best-for',
      'whats-different',
      'best-for-night',
      'location-and-setting',
      'view-and-vista',
      'design-and-aesthetic',
      'signature-amenity',
      'food-and-beverage',
      'trip-fit',
      'property-backstory',
      'booking-tip',
      'signature-feature',
      'setting',
      'history-built',
      'visit-time-tip',
      'best-for-visit-type',
    ])
  })
})
