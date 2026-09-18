import { describe, expect, it } from 'vitest'
import { createEmptyDraft } from '../../storage'
import { isItineraryMoment } from '../../types'
import { populateEmptyDaysFromShells } from './day-shell-stops.service'
import { getDayShellTemplate } from '../constants/day-shells.constants'

function seed(shellId: string) {
  const draft = createEmptyDraft()
  draft.dayShellSelections = [{ dayId: draft.days[0].id, shellId }]
  return populateEmptyDaysFromShells(draft).days[0].items
}

describe('moment-led day shells', () => {
  it('seeds workshop and picnic shells with their new badges', () => {
    const hands = seed('hands_on_local_day')
    const gardens = seed('gardens_and_slow_living')
    expect(hands).toHaveLength(9)
    expect(gardens).toHaveLength(8)
    expect(hands.find((stop) => stop.shellSlotId === 'workshop')).toMatchObject({
      moment: 'culture', momentLabel: 'Hands-on workshop', item: null,
    })
    expect(gardens.find((stop) => stop.shellSlotId === 'picnic')).toMatchObject({
      moment: 'outdoor', momentLabel: 'Picnic break', blockType: 'itinerary-attractions', item: null,
    })
  })

  it('adds two distinct shells with the new publishing-compatible badge presets', () => {
    const photo = seed('city_photo_walk')
    const music = seed('markets_and_live_music')
    expect(photo).toHaveLength(10)
    expect(music).toHaveLength(9)
    expect(photo.find((stop) => stop.shellSlotId === 'photo_stop')).toMatchObject({
      moment: 'scenic-viewpoint', momentLabel: 'Photo stop', blockType: 'itinerary-attractions', item: null,
    })
    expect(music.find((stop) => stop.shellSlotId === 'live_music')).toMatchObject({
      moment: 'nightlife', momentLabel: 'Live music', blockType: 'itinerary-nightlife', item: null,
    })
    expect(seed('rich_standard_day')).toHaveLength(11)
    expect(seed('work_and_wander_day')).toHaveLength(8)
  })

  it('seeds a rich standard day with everyday badges and empty place selections', () => {
    const stops = seed('rich_standard_day')
    expect(stops).toHaveLength(11)
    expect(stops.map((stop) => stop.moment)).toEqual([
      'breakfast', 'morning-walk', 'landmark', 'coffee', 'local-market', 'lunch',
      'culture', 'sweet-treat', 'sunset', 'dinner', 'drinks',
    ])
    expect(stops.every((stop) => stop.item === null && isItineraryMoment(stop.moment) && stop.momentLabel)).toBe(true)
  })

  it('uses work badges only in the specialist day and preserves the named fallback', () => {
    const stops = seed('work_and_wander_day')
    expect(stops).toHaveLength(8)
    expect(stops.map((stop) => stop.moment)).toContain('coworking-stop')
    expect(stops.map((stop) => stop.moment)).toContain('remote-work')
    expect(getDayShellTemplate('missing').id).toBe('rich_standard_day')
  })
})
