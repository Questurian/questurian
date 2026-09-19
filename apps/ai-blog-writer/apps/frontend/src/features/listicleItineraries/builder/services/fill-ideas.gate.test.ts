import { describe, expect, it } from 'vitest'
import {
  collectCommittedPlaceTitles,
  getFillIdeasDayGate,
  hasFillIdeasRun,
  resolveFillIdeasDayBase,
} from './fill-ideas.gate'
import {
  buildDays,
  buildFillDraft,
  buildFillItem,
  buildShellSelections,
  relatedWithHotels,
} from './fill-ideas.fixtures'

const ranOn = (dayIds: string[]) =>
  dayIds.map((dayId) => ({ dayId, ranAt: '2026-09-18T00:00:00.000Z', modelUsed: 'x' }))

describe('getFillIdeasDayGate', () => {
  it('refuses until the setup is saved', () => {
    const draft = buildFillDraft({ step1_complete: false })

    const gate = getFillIdeasDayGate(draft, 0, relatedWithHotels)

    expect(gate.canRun).toBe(false)
    expect(gate.reason).toContain('save the setup')
  })

  it('refuses without a title or a location', () => {
    expect(
      getFillIdeasDayGate(buildFillDraft({ title: '  ' }), 0, relatedWithHotels).reason,
    ).toContain('title and location')
  })

  it('refuses the whole feature when Day 1 has no lodging', () => {
    const draft = buildFillDraft({
      days: [{ id: 'day_0', whereStaying: [], items: [] }],
    })

    const gate = getFillIdeasDayGate(draft, 0, relatedWithHotels)

    expect(gate.canRun).toBe(false)
    expect(gate.reason).toContain('staying on Day 1')
  })

  it('refuses when the Day 1 lodging row exists but points at no record', () => {
    const draft = buildFillDraft({
      days: [
        {
          id: 'day_0',
          whereStaying: [
            buildFillItem({ id: 'l', blockType: 'itinerary-where-staying' }),
          ],
          items: [],
        },
      ],
    })

    expect(getFillIdeasDayGate(draft, 0, relatedWithHotels).canRun).toBe(false)
  })

  it('lets Day 1 run once the setup and lodging are there', () => {
    expect(getFillIdeasDayGate(buildFillDraft(), 0, relatedWithHotels).canRun).toBe(true)
  })

  it('locks Day 2 until Day 1 has been asked', () => {
    const draft = buildFillDraft({
      dayCount: 2,
      days: buildDays(2),
      dayShellSelections: buildShellSelections(2),
    })

    const locked = getFillIdeasDayGate(draft, 1, relatedWithHotels)
    expect(locked.canRun).toBe(false)
    expect(locked.reason).toContain('Get Day 1 ideas first')

    const unlocked = getFillIdeasDayGate(
      { ...draft, fillIdeaRuns: ranOn(['day_0']) },
      1,
      relatedWithHotels,
    )
    expect(unlocked.canRun).toBe(true)
  })

  it('locks Day 3 on Day 2 specifically, not on any earlier day', () => {
    const draft = buildFillDraft({
      dayCount: 3,
      days: buildDays(3),
      dayShellSelections: buildShellSelections(3),
      // Day 1 ran, Day 2 did not. Day 3 must still be locked, or it would be
      // handed no suggestions for the day immediately before it.
      fillIdeaRuns: ranOn(['day_0']),
    })

    const gate = getFillIdeasDayGate(draft, 2, relatedWithHotels)

    expect(gate.canRun).toBe(false)
    expect(gate.reason).toContain('Get Day 2 ideas first')
  })

  it('does not require lodging on later days', () => {
    const draft = buildFillDraft({
      dayCount: 2,
      days: buildDays(2),
      dayShellSelections: buildShellSelections(2),
      fillIdeaRuns: ranOn(['day_0']),
    })

    expect(draft.days[1].whereStaying).toHaveLength(0)
    expect(getFillIdeasDayGate(draft, 1, relatedWithHotels).canRun).toBe(true)
  })
})

describe('resolveFillIdeasDayBase', () => {
  it('carries Day 1 lodging forward to a day that sets none of its own', () => {
    const draft = buildFillDraft({
      dayCount: 3,
      days: buildDays(3),
      dayShellSelections: buildShellSelections(3),
    })

    expect(resolveFillIdeasDayBase(draft, 2, relatedWithHotels)).toEqual({
      title: 'Hotel B',
      fromDayIndex: 0,
    })
  })

  it('switches to a later day’s own lodging — that is what a transfer day is', () => {
    const days = buildDays(3)
    days[2] = {
      ...days[2],
      whereStaying: [
        buildFillItem({
          id: 'l2',
          blockType: 'itinerary-where-staying',
          item: 100,
        }),
      ],
    }
    const draft = buildFillDraft({
      dayCount: 3,
      days,
      dayShellSelections: buildShellSelections(3),
    })

    expect(resolveFillIdeasDayBase(draft, 1, relatedWithHotels)?.title).toBe('Hotel B')
    expect(resolveFillIdeasDayBase(draft, 2, relatedWithHotels)).toEqual({
      title: 'Hostal Barranco',
      fromDayIndex: 2,
    })
  })

  it('returns null when nothing up to this day has lodging', () => {
    const draft = buildFillDraft({
      days: [{ id: 'day_0', whereStaying: [], items: [] }],
    })

    expect(resolveFillIdeasDayBase(draft, 0, relatedWithHotels)).toBeNull()
  })
})

describe('collectCommittedPlaceTitles', () => {
  it('gathers picked places across every day, without duplicates', () => {
    const draft = buildFillDraft({
      dayCount: 2,
      days: [
        {
          id: 'day_0',
          whereStaying: [
            buildFillItem({
              id: 'l',
              blockType: 'itinerary-where-staying',
              item: 99,
            }),
          ],
          items: [buildFillItem({ id: 'a', item: 7 }), buildFillItem({ id: 'b' })],
        },
        {
          id: 'day_1',
          whereStaying: [],
          items: [buildFillItem({ id: 'c', item: 7 })],
        },
      ],
      dayShellSelections: buildShellSelections(2),
    })

    expect(collectCommittedPlaceTitles(draft, relatedWithHotels)).toEqual([
      'Hotel B',
      'Isolina',
    ])
  })
})

describe('hasFillIdeasRun', () => {
  it('is false for a day with no recorded run and true once recorded', () => {
    const draft = buildFillDraft()

    expect(hasFillIdeasRun(draft, 0)).toBe(false)
    expect(hasFillIdeasRun({ ...draft, fillIdeaRuns: ranOn(['day_0']) }, 0)).toBe(true)
  })
})
