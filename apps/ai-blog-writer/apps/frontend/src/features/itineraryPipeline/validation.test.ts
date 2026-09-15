import { describe, expect, it } from 'vitest'
import { createDay, createEmptyDraft, emptyTrip } from './draft'
import { defaultTemplate, findTemplate } from './templates'
import {
  canApproveDay,
  canOpenReview,
  dayCountInTitle,
  errorsOnly,
  validateDay,
  validateDraft,
  validateTrip,
} from './validation'
import type { DayDraft, TripDraft } from './types'

/**
 * Validation is asked two things: what is wrong, and where.
 *
 * So the assertions below are about the message and the field it points at, not
 * about a count of failures. A rule that blocks without saying which control to
 * fix is a rule the operator cannot act on.
 */

function trip(overrides: Partial<TripDraft> = {}): TripDraft {
  return {
    ...emptyTrip(),
    titleSeed: 'Three easy days of food and culture in Lima',
    dayCountInput: '3',
    baseCity: 'Lima, Peru',
    ...overrides,
  }
}

function day(overrides: Partial<DayDraft> = {}): DayDraft {
  return { ...createDay(0, defaultTemplate()), ...overrides }
}

describe('trip details', () => {
  it('names each missing required value and the control it belongs to', () => {
    const issues = errorsOnly(validateTrip(emptyTrip()))
    expect(issues.map(issue => issue.message)).toEqual([
      'Add your itinerary title.',
      'Enter a whole number of days, at least 1.',
      'Add a base city.',
    ])
    expect(issues.map(issue => issue.fieldId)).toEqual(['ip-title', 'ip-day-count', 'ip-base-city'])
  })

  it('does not count blank optional fields as failures', () => {
    expect(errorsOnly(validateTrip(trip()))).toHaveLength(0)
  })

  it('refuses a day count that is not a whole number of days', () => {
    for (const value of ['0', '2.5', 'three', '-1', '']) {
      const issues = errorsOnly(validateTrip(trip({ dayCountInput: value })))
      expect(issues.some(issue => issue.fieldId === 'ip-day-count')).toBe(true)
    }
  })

  it('asks for the value the chosen timing needs, and nothing else', () => {
    const dates = errorsOnly(validateTrip(trip({ timing: { mode: 'specific_dates', startDate: '', firstWeekday: '' } })))
    expect(dates).toHaveLength(1)
    expect(dates[0].fieldId).toBe('ip-start-date')

    const weekdays = errorsOnly(
      validateTrip(trip({ timing: { mode: 'weekday_sequence', startDate: '', firstWeekday: '' } })),
    )
    expect(weekdays).toHaveLength(1)
    expect(weekdays[0].fieldId).toBe('ip-first-weekday')
  })

  describe('an overnight getaway', () => {
    const withGetaway = (departureDay: number | null, returnDay: number | null, dayCount = '3') =>
      errorsOnly(
        validateTrip(
          trip({
            scope: 'with_getaway',
            dayCountInput: dayCount,
            getaway: { destination: '', departureDay, returnDay },
          }),
        ),
      )

    it('needs two days', () => {
      expect(withGetaway(1, 2, '1').map(issue => issue.message)).toContain(
        'An overnight getaway needs at least two days.',
      )
    })

    it('needs a return later than the departure', () => {
      expect(withGetaway(2, 2).map(issue => issue.message)).toContain(
        'The return day has to be later than the departure day.',
      )
    })

    it('keeps both days inside the trip', () => {
      expect(withGetaway(2, 5).some(issue => issue.message.includes('between 1 and 3'))).toBe(true)
    })

    it('is satisfied by a sensible pair', () => {
      expect(withGetaway(2, 3)).toHaveLength(0)
    })
  })

  describe('the day count stated in the title', () => {
    it('is noticed when it disagrees, as a warning only', () => {
      const issues = validateTrip(trip({ dayCountInput: '5' }))
      expect(errorsOnly(issues)).toHaveLength(0)
      expect(issues.some(issue => issue.severity === 'warning')).toBe(true)
    })

    it('reads numbers and number words', () => {
      expect(dayCountInTitle('Three easy days in Lima')).toBe(3)
      expect(dayCountInTitle('A 4-day guide to Cusco')).toBe(4)
      expect(dayCountInTitle('2 days of ceviche')).toBe(2)
    })

    it('leaves alone anything that is not a day count', () => {
      expect(dayCountInTitle('24 hours in Lima')).toBeNull()
      expect(dayCountInTitle('The 12 best rooftop bars')).toBeNull()
      expect(dayCountInTitle('A weekend in Barranco')).toBeNull()
    })
  })
})

describe('a day', () => {
  it('passes a default full day', () => {
    expect(errorsOnly(validateDay(day(), 1, trip()))).toHaveLength(0)
  })

  it('blocks a stop with no name', () => {
    const subject = day()
    subject.slots = subject.slots.map((slot, index) =>
      index === 1 ? { ...slot, label: '  ' } : slot,
    )
    const issues = errorsOnly(validateDay(subject, 1, trip()))
    expect(issues[0].message).toBe('Stop 2 needs a name.')
    expect(issues[0].slotId).toBe(subject.slots[1].id)
  })

  it('blocks a preference for a category the stop does not allow', () => {
    const subject = day()
    subject.slots = [{ ...subject.slots[0], allowedCategories: ['attractions'], preferredCategories: ['dining'] }]
    const issues = errorsOnly(validateDay(subject, 1, trip()))
    expect(issues.some(issue => issue.message.includes('prefers a category it does not allow'))).toBe(true)
  })

  it('blocks a searchable stop with no allowed category at all', () => {
    const subject = day()
    subject.slots = [{ ...subject.slots[0], allowedCategories: [], preferredCategories: [] }]
    expect(
      errorsOnly(validateDay(subject, 1, trip())).some(issue =>
        issue.message.includes('at least one allowed category'),
      ),
    ).toBe(true)
  })

  describe('the available window', () => {
    it('says which stops a morning-only day leaves out, and never deletes them', () => {
      const subject = day({ availableTime: { id: 'morning_only', customStart: '', customEnd: '', endsNextDay: false } })
      const issues = errorsOnly(validateDay(subject, 1, trip()))
      const excluded = subject.slots.filter(slot => !['morning', 'late_morning'].includes(slot.daypart))
      expect(issues.filter(issue => issue.message.includes("window leaves out"))).toHaveLength(
        excluded.length,
      )
      expect(subject.slots).toHaveLength(6)
    })

    it('lets an afternoon-onward day keep its dinner and its nightlife', () => {
      const subject = day({
        availableTime: { id: 'afternoon_onward', customStart: '', customEnd: '', endsNextDay: false },
      })
      subject.slots = subject.slots.filter(slot =>
        ['afternoon', 'dinner', 'evening', 'nightlife'].includes(slot.daypart),
      )
      expect(errorsOnly(validateDay(subject, 1, trip()))).toHaveLength(0)
    })

    it('will not wrap a custom window past midnight by implication', () => {
      const subject = day({
        availableTime: { id: 'custom', customStart: '18:00', customEnd: '02:00', endsNextDay: false },
      })
      const issues = errorsOnly(validateDay(subject, 1, trip()))
      expect(issues[0].message).toBe('Set an end time after the start, or choose Ends next day.')

      const fixed = day({
        availableTime: { id: 'custom', customStart: '18:00', customEnd: '02:00', endsNextDay: true },
      })
      expect(errorsOnly(validateDay(fixed, 1, trip()))).toHaveLength(0)
    })

    it('asks a custom window to be confirmed before it can be approved', () => {
      const draft = createEmptyDraft()
      draft.trip = trip()
      draft.days = [
        day({ availableTime: { id: 'custom', customStart: '09:00', customEnd: '23:00', endsNextDay: false } }),
      ]
      const validation = validateDraft(draft)
      // Not an error: the day is structurally fine and review is reachable.
      expect(canOpenReview(draft, validation)).toBe(true)
      expect(canApproveDay(validation, draft.days[0].id)).toBe(false)
    })
  })

  describe('travel', () => {
    it('needs both endpoints, and two different ones', () => {
      const subject = day()
      subject.slots = [
        {
          ...subject.slots[0],
          kind: 'travel',
          label: 'Drive south',
          allowedCategories: [],
          preferredCategories: [],
          travel: { from: { ref: 'custom', text: '  ' }, to: { ref: 'base' }, mode: 'car' },
        },
      ]
      expect(
        errorsOnly(validateDay(subject, 1, trip())).some(issue =>
          issue.message.includes('needs a starting point'),
        ),
      ).toBe(true)

      subject.slots[0].travel = { from: { ref: 'base' }, to: { ref: 'base' }, mode: 'car' }
      expect(
        errorsOnly(validateDay(subject, 1, trip())).some(issue =>
          issue.message.includes('starts and ends in the same place'),
        ),
      ).toBe(true)
    })

    it('is required on both getaway endpoints, in the right direction', () => {
      const getawayTrip = trip({
        scope: 'with_getaway',
        getaway: { destination: '', departureDay: 2, returnDay: 3 },
      })
      const departure = day()
      expect(
        errorsOnly(validateDay(departure, 2, getawayTrip)).some(issue =>
          issue.message.includes('Add a Travel stop from the base city to the getaway'),
        ),
      ).toBe(true)

      departure.slots = [
        ...departure.slots,
        {
          ...departure.slots[0],
          id: 'travel-out',
          kind: 'travel',
          label: 'Drive to the coast',
          travel: { from: { ref: 'base' }, to: { ref: 'getaway' }, mode: 'car' },
        },
      ]
      expect(errorsOnly(validateDay(departure, 2, getawayTrip))).toHaveLength(0)

      // The same stop on the return day points the wrong way.
      expect(
        errorsOnly(validateDay(departure, 3, getawayTrip)).some(issue =>
          issue.message.includes('back to the base city'),
        ),
      ).toBe(true)
    })
  })

  it('asks about an out-of-clock-order sequence without rearranging it', () => {
    const subject = day()
    const reversed = { ...subject, slots: [...subject.slots].reverse() }
    const issues = validateDay(reversed, 1, trip())
    expect(errorsOnly(issues)).toHaveLength(0)
    expect(issues.some(issue => issue.acknowledgmentKind === 'order_window')).toBe(true)
    expect(reversed.slots.map(slot => slot.label)).toEqual(
      [...subject.slots].reverse().map(slot => slot.label),
    )
  })
})

describe('the gates', () => {
  it('will not open review while any day is broken', () => {
    const draft = createEmptyDraft()
    draft.trip = trip()
    draft.days = [day(), day({ slots: [] })]
    expect(canOpenReview(draft, validateDraft(draft))).toBe(false)
  })

  it('opens review once every day is structurally valid', () => {
    const draft = createEmptyDraft()
    draft.trip = trip()
    draft.days = [day(), day({ ...createDay(1, findTemplate('light_full_day')!) })]
    expect(canOpenReview(draft, validateDraft(draft))).toBe(true)
  })
})
