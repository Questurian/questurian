import { relatedCollectionToBlockType, type ListicleItineraryDraft } from '../../types'
import { createEmptyItineraryStop } from '../actions/itinerary-item-creation.actions'
import { getDayShellTemplate } from '../constants/day-shells.constants'
import { getShellIdForDay } from '../components/day-shell-selection.utils'

/** Seed only empty days. Existing picks and manually edited stops stay intact. */
export function populateEmptyDaysFromShells(draft: ListicleItineraryDraft): ListicleItineraryDraft {
  return {
    ...draft,
    days: draft.days.map((day) => day.items.length ? day : {
      ...day,
      items: getDayShellTemplate(getShellIdForDay(draft, day.id), draft.customDayShells).slots.map((slot) => ({
        ...createEmptyItineraryStop(),
        blockType: relatedCollectionToBlockType(slot.preferredCollections[0] ?? slot.acceptableCollections[0] ?? 'attractions'),
        moment: slot.moment ?? null,
        momentLabel: slot.moment ? slot.label : '',
        shellSlotId: slot.id,
        shellSlotLabel: slot.label,
        shellSlotDaypart: slot.daypart,
      })),
    }),
  }
}
