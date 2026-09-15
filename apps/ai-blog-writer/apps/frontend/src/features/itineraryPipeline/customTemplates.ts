import { useCallback, useEffect, useState } from 'react'
import { listLibraryDayShells, type DayShellTemplate } from '../listicleItineraries'
import type { DayTemplate, PlaceCategory, SlotSnapshot } from './types'

/**
 * The saved custom layouts, read through the existing library endpoint.
 *
 * Read-only by design: this screen selects from the library and never writes to
 * it. Creating and editing custom layouts stays where it already lives, in the
 * listicle itinerary builder.
 *
 * The failure is contained. Built-in templates do not depend on this request,
 * so a library that is down narrows the menu instead of stopping the work —
 * which is why the loading and error text belongs inside the custom section of
 * the selector and nowhere else.
 */

/** The library knows a fourth collection this screen has no slot type for. */
function toPlaceCategories(collections: readonly string[]): PlaceCategory[] {
  return collections.filter(
    (collection): collection is PlaceCategory =>
      collection === 'dining' || collection === 'attractions' || collection === 'nightlife',
  )
}

export function adaptLibraryShell(shell: DayShellTemplate): DayTemplate {
  return {
    id: shell.id,
    name: shell.name,
    origin: 'custom',
    rhythm: shell.description,
    slots: shell.slots.map((slot): Omit<SlotSnapshot, 'id'> => {
      const allowed = toPlaceCategories(slot.acceptableCollections)
      const preferred = toPlaceCategories(slot.preferredCollections).filter(category =>
        allowed.includes(category),
      )
      return {
        sourceSlotId: slot.id,
        kind: 'place',
        label: slot.label,
        // `late_morning` exists in the library and in this screen, so the
        // daypart carries over unchanged.
        daypart: slot.daypart,
        optional: false,
        // The custom library records a stop's intent as its search cues and has
        // no separate purpose sentence, so the cues are the purpose. Restating
        // them rather than inventing a sentence keeps the operator's own words.
        purpose: slot.intentTags.join(', '),
        allowedCategories: allowed,
        preferredCategories: preferred,
        cues: [...slot.intentTags],
        exclusions: [...(slot.avoidTags ?? [])],
      }
    }),
  }
}

export interface CustomTemplatesState {
  templates: DayTemplate[]
  loading: boolean
  error: string | null
  retry: () => void
}

export function useCustomTemplates(): CustomTemplatesState {
  const [templates, setTemplates] = useState<DayTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listLibraryDayShells()
      .then(shells => {
        if (cancelled) return
        setTemplates(shells.filter(shell => shell.slots.length > 0).map(adaptLibraryShell))
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Saved layouts could not be loaded.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt(current => current + 1), [])

  return { templates, loading, error, retry }
}
