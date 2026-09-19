import { describe, expect, it } from 'vitest'
import type { ItineraryBlockType, RelatedItemOption } from '../../types'
import {
  buildItineraryFillIdeasPrompt,
  countEmptyFillSlotsForDay,
} from './fill-ideas.prompt'
import {
  buildDays,
  buildFillDraft,
  buildFillItem,
  buildShellSelections,
  fillLocations,
  relatedWithHotels,
} from './fill-ideas.fixtures'

const emptyRelated = {} as Record<ItineraryBlockType, RelatedItemOption[]>

describe('buildItineraryFillIdeasPrompt', () => {
  it('marks a slot with no record as EMPTY and names what kind of place it wants', () => {
    const draft = buildFillDraft({
      days: [
        {
          id: 'day_0',
          whereStaying: [],
          items: [
            buildFillItem({
              id: 'a',
              blockType: 'itinerary-attractions',
              shellSlotLabel: 'Must-see landmark',
              shellSlotDaypart: 'morning',
            }),
          ],
        },
      ],
    })

    const prompt = buildItineraryFillIdeasPrompt(draft, 0, emptyRelated, fillLocations)

    expect(prompt).toContain(
      '- Must-see landmark, morning — EMPTY, needs something to see or do',
    )
  })

  it('asks for one day only and says which', () => {
    const draft = buildFillDraft({
      dayCount: 5,
      days: buildDays(5),
      dayShellSelections: buildShellSelections(5),
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      2,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('The whole trip is 5 days.')
    expect(prompt).toContain('I am working on Day 3 only.')
    expect(prompt).toContain('Fill in every slot marked EMPTY for Day 3. Only this day.')
  })

  it('names the base hotel and routes the day from it', () => {
    const draft = buildFillDraft({
      dayCount: 2,
      days: buildDays(2),
      dayShellSelections: buildShellSelections(2),
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      1,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('They are staying at Hotel B. Route this day from there')
  })

  it('says the base changed when a later day brings its own lodging', () => {
    const days = buildDays(2)
    days[1] = {
      ...days[1],
      whereStaying: [
        buildFillItem({ id: 'l2', blockType: 'itinerary-where-staying', item: 100 }),
      ],
    }
    const draft = buildFillDraft({
      dayCount: 2,
      days,
      dayShellSelections: buildShellSelections(2),
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      1,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('They move today.')
    expect(prompt).toContain('staying at Hostal Barranco')
  })

  it('forbids repeating places already committed anywhere in the trip', () => {
    const days = buildDays(2)
    days[0] = { ...days[0], items: [buildFillItem({ id: 'a', item: 7 })] }
    const draft = buildFillDraft({
      dayCount: 2,
      days,
      dayShellSelections: buildShellSelections(2),
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      1,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('do not suggest these again')
    expect(prompt).toContain('- Isolina')
  })

  it('hands an earlier day’s suggestions forward so the next day cannot repeat them', () => {
    const draft = buildFillDraft({
      dayCount: 3,
      days: buildDays(3),
      dayShellSelections: buildShellSelections(3),
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      2,
      relatedWithHotels,
      fillLocations,
      [
        { dayIndex: 0, text: 'Day one suggested El Pan de la Chola.' },
        { dayIndex: 1, text: 'Day two suggested Canta Rana.' },
      ],
    )

    expect(prompt).toContain('What you suggested for Day 1.')
    expect(prompt).toContain('El Pan de la Chola')
    expect(prompt).toContain('What you suggested for Day 2.')
    expect(prompt).toContain('Canta Rana')
  })

  it('leaves out a prior day whose document could not be loaded', () => {
    const draft = buildFillDraft({
      dayCount: 2,
      days: buildDays(2),
      dayShellSelections: buildShellSelections(2),
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      1,
      relatedWithHotels,
      fillLocations,
      [{ dayIndex: 0, text: '' }],
    )

    expect(prompt).not.toContain('What you suggested for Day 1')
  })

  it('sends the readable place name, never the raw scope key', () => {
    const prompt = buildItineraryFillIdeasPrompt(
      buildFillDraft(),
      0,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('Place: Miraflores, Lima, Peru.')
    expect(prompt).not.toContain('peru|lima|miraflores')
  })

  it('asks for HTML with nothing around it', () => {
    const prompt = buildItineraryFillIdeasPrompt(
      buildFillDraft(),
      0,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('Return the whole answer as one HTML document')
  })

  describe('walking distance', () => {
    // A run suggested a breakfast 25 minutes' walk from the hotel as its lead
    // option, because "how far apart they are" set no limit. These assertions
    // exist so the limits cannot quietly go soft again.
    const prompt = () =>
      buildItineraryFillIdeasPrompt(buildFillDraft(), 0, relatedWithHotels, fillLocations)

    it('pins the first stop of the day to a 10 minute walk from the hotel', () => {
      expect(prompt()).toContain(
        'The first stop of the day must be within a 10 minute walk of the hotel.',
      )
    })

    it('caps the walk between consecutive stops', () => {
      expect(prompt()).toContain('within about a 15 minute walk of the stop')
    })

    it('allows a taxi later but not before breakfast', () => {
      const text = prompt()
      expect(text).toContain('Nobody wants a taxi before breakfast.')
      expect(text).toContain('A taxi is fine later in the day. It is not fine first')
    })

    it('keeps a slot\u2019s alternates in the same part of town as the lead pick', () => {
      expect(prompt()).toContain(
        'The alternates for a slot have to sit in the same part of town as the',
      )
    })

    it('makes every suggestion print its own walking time', () => {
      expect(prompt()).toContain('give its walking time from the stop before it')
    })

    it('asks for a lead pick rather than three equal options', () => {
      expect(prompt()).toContain('give me a lead pick first, then one or two alternates')
    })

    it('refuses duplicate places and two entries at one address', () => {
      expect(prompt()).toContain(
        'Never offer the same place twice, and never offer two places at the same',
      )
    })

    it('says to move a slot rather than stretch the walk to fit', () => {
      expect(prompt()).toContain('Do not stretch the walk to make it fit.')
    })
  })

  it('never carries the pickable pool — the answer is inspiration, not a shortlist', () => {
    const prompt = buildItineraryFillIdeasPrompt(
      buildFillDraft(),
      0,
      relatedWithHotels,
      fillLocations,
    )

    // Maido is in the pool and in nothing else; it must not leak into the ask.
    expect(prompt).not.toContain('Maido')
  })

  it('carries the traveler profile and the brief when the draft has them', () => {
    const draft = buildFillDraft({
      generationBrief: 'Slow mornings, no queues.',
      travelerProfile: {
        travelerTypes: ['couple'],
        motivations: ['food'],
        interests: [],
        budget: '$$',
        accommodations: [],
        practicalNeeds: [],
        notes: '',
        composedBrief: '',
      },
    })

    const prompt = buildItineraryFillIdeasPrompt(
      draft,
      0,
      relatedWithHotels,
      fillLocations,
    )

    expect(prompt).toContain('Traveler: couple')
    expect(prompt).toContain('Budget: $$')
    expect(prompt).toContain('Slow mornings, no queues.')
  })
})

describe('countEmptyFillSlotsForDay', () => {
  it('counts only the day asked about', () => {
    const draft = buildFillDraft({
      dayCount: 2,
      days: [
        {
          id: 'day_0',
          whereStaying: [],
          items: [buildFillItem({ id: 'a' }), buildFillItem({ id: 'b', item: 7 })],
        },
        {
          id: 'day_1',
          whereStaying: [],
          items: [buildFillItem({ id: 'c' }), buildFillItem({ id: 'd' })],
        },
      ],
      dayShellSelections: buildShellSelections(2),
    })

    expect(countEmptyFillSlotsForDay(draft, 0, relatedWithHotels)).toBe(1)
    expect(countEmptyFillSlotsForDay(draft, 1, relatedWithHotels)).toBe(2)
  })

  it('counts a manual tour stop as filled once it has a title', () => {
    const draft = buildFillDraft({
      days: [
        {
          id: 'day_0',
          whereStaying: [],
          items: [
            buildFillItem({
              id: 'a',
              blockType: 'itinerary-tour-agency',
              title: 'Barrio walk',
            }),
          ],
        },
      ],
    })

    expect(countEmptyFillSlotsForDay(draft, 0, emptyRelated)).toBe(0)
  })
})
