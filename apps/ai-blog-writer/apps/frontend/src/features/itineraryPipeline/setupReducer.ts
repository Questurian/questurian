import {
  acknowledgmentKey,
  createDay,
  createEmptyDraft,
  createId,
  layoutSignature,
  snapshotTemplate,
  tripSignature,
} from './draft'
import { defaultTemplate } from './templates'
import type {
  AvailableTime,
  DayDraft,
  DayTemplate,
  ItinerarySetupDraft,
  SlotSnapshot,
  SharedPreferences,
  Stage,
  TripDraft,
} from './types'

/**
 * Every transition the draft can make, in one place.
 *
 * Two things this reducer is careful about, both of them bugs the plan names
 * explicitly. Days are rebuilt by `map` and only the targeted day is replaced,
 * so editing Day 2 cannot reach into Day 1 through a shared array or a shared
 * slot object. And anything that copies a layout — choosing a template, copying
 * to other days, adding a preset — mints fresh occurrence ids, so two days that
 * look alike are never the same editable stops.
 *
 * Approval is not cleared here. It cannot go stale silently, because it is
 * validated against the signature of what it approved (see `draft.ts`), which
 * means "edit reopens approval" needs no bookkeeping and cannot be forgotten.
 */

export interface RemovedSlot {
  dayId: string
  slot: SlotSnapshot
  index: number
}

export interface SetupState {
  draft: ItinerarySetupDraft
  /** The last removed stop, kept recoverable until the next removal. */
  lastRemoval: RemovedSlot | null
}

export type SetupAction =
  | { type: 'hydrate'; draft: ItinerarySetupDraft }
  | { type: 'reset' }
  | { type: 'patchTrip'; patch: Partial<TripDraft> }
  | { type: 'patchPreferences'; patch: Partial<SharedPreferences> }
  | { type: 'addArea'; area: string }
  | { type: 'removeArea'; area: string }
  | { type: 'syncDays'; count: number }
  | { type: 'setStage'; stage: Stage }
  | { type: 'setActiveDay'; dayId: string }
  | { type: 'setExpandedSlot'; slotId: string | null }
  | { type: 'patchDay'; dayId: string; patch: Partial<Pick<DayDraft, 'label' | 'setupNotes' | 'preparationNotes'>> }
  | { type: 'setAvailableTime'; dayId: string; availableTime: AvailableTime }
  | { type: 'applyTemplate'; dayId: string; template: DayTemplate }
  | { type: 'patchSlot'; dayId: string; slotId: string; patch: Partial<SlotSnapshot> }
  | { type: 'addSlot'; dayId: string; slot: Omit<SlotSnapshot, 'id'> }
  | { type: 'removeSlot'; dayId: string; slotId: string }
  | { type: 'undoRemoveSlot' }
  | { type: 'moveSlot'; dayId: string; slotId: string; direction: -1 | 1 }
  | { type: 'copyLayout'; fromDayId: string; toDayIds: string[] }
  | { type: 'approveDay'; dayId: string }
  | { type: 'reopenDay'; dayId: string }
  | { type: 'acknowledge'; dayId: string; kind: string }

export function initialState(draft: ItinerarySetupDraft = createEmptyDraft()): SetupState {
  return { draft, lastRemoval: null }
}

function touch(draft: ItinerarySetupDraft): ItinerarySetupDraft {
  return { ...draft, updatedAt: new Date().toISOString() }
}

function mapDay(
  draft: ItinerarySetupDraft,
  dayId: string,
  change: (day: DayDraft) => DayDraft,
): ItinerarySetupDraft {
  return touch({
    ...draft,
    days: draft.days.map(day => (day.id === dayId ? change(day) : day)),
  })
}

function mapSlots(
  draft: ItinerarySetupDraft,
  dayId: string,
  change: (slots: SlotSnapshot[]) => SlotSnapshot[],
): ItinerarySetupDraft {
  return mapDay(draft, dayId, day => ({ ...day, slots: change(day.slots) }))
}

/** A fresh, independent copy of a stop. Used wherever a layout is duplicated. */
function copySlot(slot: SlotSnapshot): SlotSnapshot {
  return {
    ...slot,
    id: createId('slot'),
    allowedCategories: [...slot.allowedCategories],
    preferredCategories: [...slot.preferredCategories],
    cues: [...slot.cues],
    exclusions: [...slot.exclusions],
    travel: slot.travel ? { ...slot.travel } : undefined,
  }
}

export function setupReducer(state: SetupState, action: SetupAction): SetupState {
  const { draft } = state

  switch (action.type) {
    case 'hydrate':
      return { draft: action.draft, lastRemoval: null }

    case 'reset':
      return initialState(createEmptyDraft())

    case 'patchTrip':
      return { ...state, draft: touch({ ...draft, trip: { ...draft.trip, ...action.patch } }) }

    case 'patchPreferences':
      return {
        ...state,
        draft: touch({
          ...draft,
          trip: {
            ...draft.trip,
            sharedPreferences: { ...draft.trip.sharedPreferences, ...action.patch },
          },
        }),
      }

    case 'addArea': {
      const area = action.area.trim()
      if (!area) return state
      const exists = draft.trip.preferredAreas.some(
        existing => existing.toLowerCase() === area.toLowerCase(),
      )
      if (exists) return state
      return {
        ...state,
        draft: touch({
          ...draft,
          trip: { ...draft.trip, preferredAreas: [...draft.trip.preferredAreas, area] },
        }),
      }
    }

    case 'removeArea':
      return {
        ...state,
        draft: touch({
          ...draft,
          trip: {
            ...draft.trip,
            preferredAreas: draft.trip.preferredAreas.filter(area => area !== action.area),
          },
        }),
      }

    /**
     * Make the day list match the count.
     *
     * Growing appends defaults and leaves every existing day — its id, its
     * edits, its notes — exactly where it was. Shrinking drops from the end,
     * which is why the UI shows precisely which days those are first.
     */
    case 'syncDays': {
      const count = Math.max(0, Math.floor(action.count))
      if (count === draft.days.length) return state
      const days =
        count < draft.days.length
          ? draft.days.slice(0, count)
          : [
              ...draft.days,
              ...Array.from({ length: count - draft.days.length }, (_, offset) =>
                createDay(draft.days.length + offset, defaultTemplate()),
              ),
            ]
      const activeStillExists = days.some(day => day.id === draft.ui.activeDayId)
      // Nothing selected yet means the days were just created, so start at the
      // first. Losing the selected day means it was removed from the end, so
      // fall back to the last one still standing.
      const activeDayId = activeStillExists
        ? draft.ui.activeDayId
        : draft.ui.activeDayId === null
          ? (days[0]?.id ?? null)
          : (days[days.length - 1]?.id ?? null)
      return {
        ...state,
        draft: touch({ ...draft, days, ui: { ...draft.ui, activeDayId } }),
      }
    }

    case 'setStage':
      return { ...state, draft: touch({ ...draft, ui: { ...draft.ui, stage: action.stage } }) }

    case 'setActiveDay':
      return {
        ...state,
        draft: touch({
          ...draft,
          ui: { ...draft.ui, activeDayId: action.dayId, expandedSlotId: null },
        }),
      }

    case 'setExpandedSlot':
      return {
        ...state,
        draft: touch({ ...draft, ui: { ...draft.ui, expandedSlotId: action.slotId } }),
      }

    case 'patchDay':
      return { ...state, draft: mapDay(draft, action.dayId, day => ({ ...day, ...action.patch })) }

    case 'setAvailableTime':
      return {
        ...state,
        draft: mapDay(draft, action.dayId, day => ({
          ...day,
          availableTime: { ...action.availableTime },
        })),
      }

    /**
     * Replace the day's stops with a fresh snapshot of a template.
     *
     * Only ever reached from an explicit "Use this layout" — browsing the
     * selector previews and never applies. The snapshot is deep and re-ided, so
     * a later edit to the library cannot rewrite this day.
     */
    case 'applyTemplate':
      return {
        ...state,
        draft: mapDay(draft, action.dayId, day => ({
          ...day,
          sourceTemplateId: action.template.id,
          sourceTemplateName: action.template.name,
          sourceTemplateOrigin: action.template.origin,
          slots: snapshotTemplate(action.template),
          acknowledgments: [],
        })),
      }

    case 'patchSlot':
      return {
        ...state,
        draft: mapSlots(draft, action.dayId, slots =>
          slots.map(slot => (slot.id === action.slotId ? { ...slot, ...action.patch } : slot)),
        ),
      }

    case 'addSlot': {
      const slot: SlotSnapshot = { ...action.slot, id: createId('slot') }
      return {
        ...state,
        draft: {
          ...mapSlots(draft, action.dayId, slots => [...slots, slot]),
          ui: { ...draft.ui, expandedSlotId: slot.id },
        },
      }
    }

    case 'removeSlot': {
      const day = draft.days.find(candidate => candidate.id === action.dayId)
      const index = day?.slots.findIndex(slot => slot.id === action.slotId) ?? -1
      if (!day || index < 0) return state
      return {
        draft: {
          ...mapSlots(draft, action.dayId, slots =>
            slots.filter(slot => slot.id !== action.slotId),
          ),
          ui: {
            ...draft.ui,
            expandedSlotId: draft.ui.expandedSlotId === action.slotId ? null : draft.ui.expandedSlotId,
          },
        },
        lastRemoval: { dayId: action.dayId, slot: day.slots[index], index },
      }
    }

    case 'undoRemoveSlot': {
      const removal = state.lastRemoval
      if (!removal) return state
      if (!draft.days.some(day => day.id === removal.dayId)) {
        return { ...state, lastRemoval: null }
      }
      return {
        draft: mapSlots(draft, removal.dayId, slots => {
          const restored = [...slots]
          restored.splice(Math.min(removal.index, restored.length), 0, removal.slot)
          return restored
        }),
        lastRemoval: null,
      }
    }

    case 'moveSlot':
      return {
        ...state,
        draft: mapSlots(draft, action.dayId, slots => {
          const index = slots.findIndex(slot => slot.id === action.slotId)
          const target = index + action.direction
          if (index < 0 || target < 0 || target >= slots.length) return slots
          const moved = [...slots]
          ;[moved[index], moved[target]] = [moved[target], moved[index]]
          return moved
        }),
      }

    /**
     * Copy one day's shape onto others.
     *
     * Type, stops and optional flags travel. Working title, available window,
     * notes, ids and approvals stay with the target — they describe that day,
     * not this layout.
     */
    case 'copyLayout': {
      const source = draft.days.find(day => day.id === action.fromDayId)
      if (!source) return state
      const targets = new Set(action.toDayIds.filter(id => id !== action.fromDayId))
      if (targets.size === 0) return state
      return {
        ...state,
        draft: touch({
          ...draft,
          days: draft.days.map(day =>
            targets.has(day.id)
              ? {
                  ...day,
                  sourceTemplateId: source.sourceTemplateId,
                  sourceTemplateName: source.sourceTemplateName,
                  sourceTemplateOrigin: source.sourceTemplateOrigin,
                  slots: source.slots.map(copySlot),
                  acknowledgments: [],
                }
              : day,
          ),
        }),
      }
    }

    case 'approveDay':
      return {
        ...state,
        draft: mapDay(draft, action.dayId, day => ({
          ...day,
          approval: {
            tripRevision: tripSignature(draft.trip),
            layoutRevision: layoutSignature(day),
            approvedAt: new Date().toISOString(),
          },
        })),
      }

    case 'reopenDay':
      return {
        ...state,
        draft: mapDay(draft, action.dayId, day => ({ ...day, approval: undefined })),
      }

    case 'acknowledge':
      return {
        ...state,
        draft: mapDay(draft, action.dayId, day => ({
          ...day,
          acknowledgments: [...day.acknowledgments, acknowledgmentKey(action.kind, day)],
        })),
      }

    default:
      return state
  }
}
