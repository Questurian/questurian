import type {
  DayShellId,
  DayShellSelection,
  ListicleItineraryDraft,
} from '../../types'
import { DEFAULT_DAY_SHELL_ID } from '../constants/day-shells.constants'

export function getShellIdForDay(
  draft: ListicleItineraryDraft,
  dayId: string,
): DayShellId {
  return (
    draft.dayShellSelections?.find((entry) => entry.dayId === dayId)?.shellId ??
    DEFAULT_DAY_SHELL_ID
  )
}

export function buildDayShellSelections(
  draft: ListicleItineraryDraft,
  fallbackShellId = DEFAULT_DAY_SHELL_ID,
): DayShellSelection[] {
  return draft.days.map((day) => ({
    dayId: day.id,
    shellId: getShellIdForDay(draft, day.id) || fallbackShellId,
  }))
}

export function setShellForDay(
  draft: ListicleItineraryDraft,
  dayId: string,
  shellId: DayShellId,
): DayShellSelection[] {
  return buildDayShellSelections(draft).map((entry) =>
    entry.dayId === dayId ? { ...entry, shellId } : entry,
  )
}

export function setShellForAllDays(
  draft: ListicleItineraryDraft,
  shellId: DayShellId,
): DayShellSelection[] {
  return draft.days.map((day) => ({ dayId: day.id, shellId }))
}
