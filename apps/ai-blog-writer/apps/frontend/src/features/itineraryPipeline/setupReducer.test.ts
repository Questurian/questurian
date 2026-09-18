import { describe, expect, it } from 'vitest'
import { createEmptyDraft, dayStays, isApprovalCurrent } from './draft'
import { initialState, setupReducer, type SetupAction, type SetupState } from './setupReducer'
import { BUILT_IN_TEMPLATES, findTemplate } from './templates'
import type { ItinerarySetupDraft } from './types'

/**
 * The reducer's job is independence.
 *
 * Everything below is a version of one bug: two days that look alike turning
 * out to be the same days. A template chosen twice, a layout copied, an id
 * taken from an array position — each of them ends with an edit on Day 2
 * showing up on Day 1, or with notes attached to a day that no longer exists.
 */

function run(actions: SetupAction[], from?: ItinerarySetupDraft): SetupState {
  return actions.reduce(setupReducer, initialState(from ?? createEmptyDraft()))
}

function threeDays(): SetupState {
  return run([
    { type: 'patchTrip', patch: { titleSeed: 'Three easy days in Lima', dayCountInput: '3', baseCity: 'Lima' } },
    { type: 'syncDays', count: 3 },
  ])
}

describe('day identity', () => {
  it('gives three days three different identities', () => {
    const { draft } = threeDays()
    const ids = draft.days.map(day => day.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })

  it('gives every stop occurrence its own id, across days on the same template', () => {
    const { draft } = threeDays()
    const slotIds = draft.days.flatMap(day => day.slots.map(slot => slot.id))
    expect(slotIds.length).toBeGreaterThan(10)
    expect(new Set(slotIds).size).toBe(slotIds.length)
  })

  it('edits one day without touching another', () => {
    const before = threeDays()
    const [dayOne, dayTwo] = before.draft.days
    const firstSlotOfDayTwo = dayTwo.slots[0]

    const after = setupReducer(before, {
      type: 'patchSlot',
      dayId: dayTwo.id,
      slotId: firstSlotOfDayTwo.id,
      patch: { label: 'Something else entirely' },
    })

    expect(after.draft.days[1].slots[0].label).toBe('Something else entirely')
    expect(after.draft.days[0].slots[0].label).toBe(dayOne.slots[0].label)
    // The untouched day is the same object, so nothing re-renders for it either.
    expect(after.draft.days[0]).toBe(dayOne)
  })
})

describe('choosing a day type', () => {
  it('snapshots the template rather than referring to it', () => {
    const before = threeDays()
    const foodFocused = findTemplate('food_focused_full_day')!
    const after = setupReducer(before, {
      type: 'applyTemplate',
      dayId: before.draft.days[1].id,
      template: foodFocused,
    })

    const day = after.draft.days[1]
    expect(day.slots.map(slot => slot.label)).toEqual(foodFocused.slots.map(slot => slot.label))
    expect(day.sourceTemplateName).toBe('Food-Focused Full Day')
    // Provenance is kept; ownership is not.
    expect(day.slots[0].sourceSlotId).toBe(foodFocused.slots[0].sourceSlotId)
    expect(day.slots[0]).not.toBe(foodFocused.slots[0])
    expect(day.slots[0].cues).not.toBe(foodFocused.slots[0].cues)
    expect(after.draft.days[0].sourceTemplateId).toBe('full_day_balanced')
    expect(after.draft.days[2].sourceTemplateId).toBe('full_day_balanced')
  })

  it('carries the full rules, not just the stop names', () => {
    const before = threeDays()
    const nightlife = findTemplate('nightlife_full_day')!
    const after = setupReducer(before, {
      type: 'applyTemplate',
      dayId: before.draft.days[0].id,
      template: nightlife,
    })

    const slots = after.draft.days[0].slots
    const main = slots[slots.length - 1]
    expect(main.label).toBe('Main nightlife destination')
    expect(main.allowedCategories).toEqual(['nightlife'])
    expect(main.purpose).toMatch(/main club/i)
    // An exclusion from the appendix reaches the day, not just the name.
    const lowKey = slots.find(slot => slot.label === 'Low-key daytime activity')!
    expect(lowKey.exclusions).toContain('strenuous')
  })

  it('has seven built-ins, each with its own sequence', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(7)
    const shapes = BUILT_IN_TEMPLATES.map(template =>
      template.slots.map(slot => slot.label).join('|'),
    )
    expect(new Set(shapes).size).toBe(7)
  })
})

describe('copying a layout', () => {
  it('gives the target its own stops and leaves its own day data alone', () => {
    let state = threeDays()
    const [source, target] = state.draft.days
    state = setupReducer(state, {
      type: 'patchDay',
      dayId: target.id,
      patch: { label: 'Arrival day', setupNotes: 'Lands at 11am' },
    })
    state = setupReducer(state, {
      type: 'applyTemplate',
      dayId: source.id,
      template: findTemplate('adventure_full_day')!,
    })
    state = setupReducer(state, { type: 'copyLayout', fromDayId: source.id, toDayIds: [target.id] })

    const copied = state.draft.days[1]
    const original = state.draft.days[0]
    expect(copied.sourceTemplateId).toBe('adventure_full_day')
    expect(copied.slots.map(slot => slot.label)).toEqual(original.slots.map(slot => slot.label))
    expect(copied.slots.map(slot => slot.id)).not.toEqual(original.slots.map(slot => slot.id))
    // What describes the target day stays with the target day.
    expect(copied.label).toBe('Arrival day')
    expect(copied.setupNotes).toBe('Lands at 11am')

    const edited = setupReducer(state, {
      type: 'patchSlot',
      dayId: copied.id,
      slotId: copied.slots[0].id,
      patch: { label: 'Changed' },
    })
    expect(edited.draft.days[0].slots[0].label).toBe(original.slots[0].label)
  })
})

describe('changing the day count', () => {
  it('appends without disturbing the days that exist', () => {
    const before = threeDays()
    const after = setupReducer(before, { type: 'syncDays', count: 5 })
    expect(after.draft.days).toHaveLength(5)
    expect(after.draft.days.slice(0, 3).map(day => day.id)).toEqual(
      before.draft.days.map(day => day.id),
    )
  })

  it('removes from the end and moves off a day that is gone', () => {
    let state = threeDays()
    state = setupReducer(state, { type: 'setActiveDay', dayId: state.draft.days[2].id })
    const after = setupReducer(state, { type: 'syncDays', count: 2 })
    expect(after.draft.days).toHaveLength(2)
    expect(after.draft.ui.activeDayId).toBe(after.draft.days[1].id)
  })
})

describe('stops', () => {
  it('restores a removed stop to where it was', () => {
    const state = threeDays()
    const day = state.draft.days[0]
    const removed = day.slots[2]

    const afterRemove = setupReducer(state, { type: 'removeSlot', dayId: day.id, slotId: removed.id })
    expect(afterRemove.draft.days[0].slots).toHaveLength(day.slots.length - 1)
    expect(afterRemove.lastRemoval?.slot.id).toBe(removed.id)

    const afterUndo = setupReducer(afterRemove, { type: 'undoRemoveSlot' })
    expect(afterUndo.draft.days[0].slots[2].id).toBe(removed.id)
    expect(afterUndo.lastRemoval).toBeNull()
  })

  it('moves a stop without reordering anything else', () => {
    const state = threeDays()
    const day = state.draft.days[0]
    const labels = day.slots.map(slot => slot.label)
    const after = setupReducer(state, {
      type: 'moveSlot',
      dayId: day.id,
      slotId: day.slots[1].id,
      direction: -1,
    })
    const moved = after.draft.days[0].slots.map(slot => slot.label)
    expect(moved[0]).toBe(labels[1])
    expect(moved[1]).toBe(labels[0])
    expect(moved.slice(2)).toEqual(labels.slice(2))
  })

  it('refuses to move a stop past the ends', () => {
    const state = threeDays()
    const day = state.draft.days[0]
    const after = setupReducer(state, {
      type: 'moveSlot',
      dayId: day.id,
      slotId: day.slots[0].id,
      direction: -1,
    })
    expect(after.draft.days[0].slots.map(slot => slot.id)).toEqual(day.slots.map(slot => slot.id))
  })
})

describe('approval', () => {
  it('survives a change that changes nothing', () => {
    let state = threeDays()
    const day = state.draft.days[0]
    state = setupReducer(state, { type: 'approveDay', dayId: day.id })
    expect(isApprovalCurrent(state.draft.days[0], state.draft.trip)).toBe(true)

    state = setupReducer(state, {
      type: 'patchDay',
      dayId: day.id,
      patch: { label: state.draft.days[0].label },
    })
    state = setupReducer(state, { type: 'setActiveDay', dayId: day.id })
    expect(isApprovalCurrent(state.draft.days[0], state.draft.trip)).toBe(true)
  })

  it('does not survive an edit to the layout it approved', () => {
    let state = threeDays()
    const day = state.draft.days[0]
    state = setupReducer(state, { type: 'approveDay', dayId: day.id })
    state = setupReducer(state, {
      type: 'patchSlot',
      dayId: day.id,
      slotId: day.slots[0].id,
      patch: { label: 'A different anchor' },
    })
    expect(isApprovalCurrent(state.draft.days[0], state.draft.trip)).toBe(false)
    // The record is kept, so review can say "this needs looking at again".
    expect(state.draft.days[0].approval).toBeDefined()
  })

  it('reopens every day when a shared trip detail changes', () => {
    let state = threeDays()
    for (const day of state.draft.days) {
      state = setupReducer(state, { type: 'approveDay', dayId: day.id })
    }
    expect(state.draft.days.every(day => isApprovalCurrent(day, state.draft.trip))).toBe(true)

    state = setupReducer(state, { type: 'patchTrip', patch: { baseCity: 'Cusco' } })
    expect(state.draft.days.some(day => isApprovalCurrent(day, state.draft.trip))).toBe(false)
  })

  it('is not disturbed by preparation notes', () => {
    let state = threeDays()
    const day = state.draft.days[0]
    state = setupReducer(state, { type: 'approveDay', dayId: day.id })
    state = setupReducer(state, {
      type: 'patchDay',
      dayId: day.id,
      patch: { preparationNotes: 'Ask about the Sunday market' },
    })
    expect(isApprovalCurrent(state.draft.days[0], state.draft.trip)).toBe(true)
  })
})

describe('stays', () => {
  it('defaults a new stay to the nights the trip has, leaving departure day free', () => {
    const state = setupReducer(threeDays(), { type: 'addStay', mode: 'location_manager' })
    const [stay] = state.draft.trip.stays ?? []
    expect([stay.firstNight, stay.lastNight]).toEqual([1, 2])
    expect(dayStays(state.draft.trip.stays, 3)).toEqual({ start: stay, end: null })
  })

  it('starts the next stay after the nights already covered', () => {
    let state = threeDays()
    state = setupReducer(state, { type: 'addStay', mode: 'location_manager' })
    const first = state.draft.trip.stays![0]
    state = setupReducer(state, {
      type: 'patchStay',
      stayId: first.id,
      patch: { lastNight: 1, name: 'Casa' },
    })
    state = setupReducer(state, { type: 'addStay', mode: 'recommend' })
    const second = state.draft.trip.stays![1]
    expect([second.mode, second.firstNight, second.lastNight]).toEqual(['recommend', 2, 2])
    // Day 2 starts where night 1 was spent and ends where night 2 is.
    expect(dayStays(state.draft.trip.stays, 2)).toEqual({ start: state.draft.trip.stays![0], end: second })
  })

  it('never reopens an approved layout', () => {
    let state = threeDays()
    for (const day of state.draft.days) {
      state = setupReducer(state, { type: 'approveDay', dayId: day.id })
    }
    state = setupReducer(state, { type: 'addStay', mode: 'location_manager' })
    const stay = state.draft.trip.stays![0]
    state = setupReducer(state, { type: 'patchStay', stayId: stay.id, patch: { name: 'Hotel B' } })
    expect(state.draft.days.every(day => isApprovalCurrent(day, state.draft.trip))).toBe(true)
    state = setupReducer(state, { type: 'removeStay', stayId: stay.id })
    expect(state.draft.trip.stays).toEqual([])
    expect(state.draft.days.every(day => isApprovalCurrent(day, state.draft.trip))).toBe(true)
  })

  it('reads a draft saved before stays existed', () => {
    const old = createEmptyDraft()
    delete (old.trip as { stays?: unknown }).stays
    const state = setupReducer(initialState(old), { type: 'addStay', mode: 'recommend' })
    expect(state.draft.trip.stays).toHaveLength(1)
    expect(dayStays(old.trip.stays, 1)).toEqual({ start: null, end: null })
  })
})
