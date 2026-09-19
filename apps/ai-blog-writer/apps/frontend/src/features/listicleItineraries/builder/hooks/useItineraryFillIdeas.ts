import { useCallback, useEffect, useState } from 'react'
import type {
  ItineraryBlockType,
  ListicleItineraryDraft,
  LocationOption,
  RelatedItemOption,
} from '../../types'
import {
  requestItineraryFillIdeas,
  type ItineraryFillIdeas,
} from '../services/fill-ideas.api'
import {
  buildItineraryFillIdeasPrompt,
  type PriorDaySuggestions,
} from '../services/fill-ideas.prompt'
import { getFillIdeasDayGate } from '../services/fill-ideas.gate'
import {
  htmlToPlainText,
  loadFillIdeasDocument,
  loadFillIdeasDocuments,
  saveFillIdeasDocument,
} from '../services/fill-ideas.store'

type UseItineraryFillIdeasParams = {
  draft: ListicleItineraryDraft | null
  setDraft: React.Dispatch<React.SetStateAction<ListicleItineraryDraft | null>>
  relatedByBlockType: Record<ItineraryBlockType, RelatedItemOption[]>
  locations: LocationOption[]
  /** The day tab the operator is on; the modal follows it. */
  activeDayIndex: number
}

/**
 * Run state for one day's fill-in ideas.
 *
 * Two things outlive the run and they are stored in different places on
 * purpose. The *fact* that a day ran goes on the draft, because it is what
 * unlocks the next day and it has to survive a reload. The document goes in
 * IndexedDB, because seven of them would not fit comfortably in the draft's
 * localStorage value (see `fill-ideas.store.ts`).
 *
 * Opening a day that already ran reads its document back rather than re-asking:
 * a run costs real money and several minutes, and the operator switching tabs
 * to re-read Day 2 must never be a second charge.
 */
export function useItineraryFillIdeas({
  draft,
  setDraft,
  relatedByBlockType,
  locations,
  activeDayIndex,
}: UseItineraryFillIdeasParams) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<ItineraryFillIdeas | null>(null)
  const [prompt, setPrompt] = useState('')
  const [viewedDayIndex, setViewedDayIndex] = useState(0)

  const draftId = draft?.draftId ?? ''
  const activeDayId = draft?.days[activeDayIndex]?.id ?? ''

  // Show the stored document for whichever day the operator is looking at, so a
  // day that already ran reads back instead of looking un-run.
  useEffect(() => {
    if (!draftId || !activeDayId || isLoading) return
    let cancelled = false
    void loadFillIdeasDocument(draftId, activeDayId).then((stored) => {
      if (cancelled) return
      setViewedDayIndex(activeDayIndex)
      setIdeas(
        stored
          ? {
              html: stored.html,
              model_used: stored.modelUsed,
              cost_usd: null,
              elapsed_seconds: null,
            }
          : null,
      )
      setPrompt('')
      setError(null)
    })
    return () => {
      cancelled = true
    }
  }, [activeDayId, activeDayIndex, draftId, isLoading])

  const requestFillIdeas = useCallback(async () => {
    if (!draft || isLoading) return
    const day = draft.days[activeDayIndex]
    if (!day) return

    const gate = getFillIdeasDayGate(draft, activeDayIndex, relatedByBlockType)
    if (!gate.canRun) {
      setError(gate.reason)
      setIsOpen(true)
      return
    }

    const priorDayIds = draft.days.slice(0, activeDayIndex).map((prior) => prior.id)
    const stored = await loadFillIdeasDocuments(draft.draftId, priorDayIds)
    const priorDays: PriorDaySuggestions[] = priorDayIds.map((dayId, index) => ({
      dayIndex: index,
      text: stored.get(dayId)?.text ?? '',
    }))

    const nextPrompt = buildItineraryFillIdeasPrompt(
      draft,
      activeDayIndex,
      relatedByBlockType,
      locations,
      priorDays,
    )

    setViewedDayIndex(activeDayIndex)
    setPrompt(nextPrompt)
    setIdeas(null)
    setError(null)
    setIsOpen(true)
    setIsLoading(true)
    try {
      const result = await requestItineraryFillIdeas(nextPrompt)
      setIdeas(result)

      await saveFillIdeasDocument({
        draftId: draft.draftId,
        dayId: day.id,
        html: result.html,
        text: htmlToPlainText(result.html),
        modelUsed: result.model_used,
        ranAt: new Date().toISOString(),
      })

      setDraft((current) => {
        if (!current) return current
        const runs = (current.fillIdeaRuns ?? []).filter(
          (run) => run.dayId !== day.id,
        )
        return {
          ...current,
          fillIdeaRuns: [
            ...runs,
            {
              dayId: day.id,
              ranAt: new Date().toISOString(),
              modelUsed: result.model_used,
            },
          ],
        }
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIsLoading(false)
    }
  }, [activeDayIndex, draft, isLoading, locations, relatedByBlockType, setDraft])

  return {
    fillIdeas: ideas,
    fillIdeasPrompt: prompt,
    fillIdeasError: error,
    fillIdeasDayIndex: viewedDayIndex,
    isFillIdeasOpen: isOpen,
    isRequestingFillIdeas: isLoading,
    openFillIdeas: useCallback(() => setIsOpen(true), []),
    closeFillIdeas: useCallback(() => setIsOpen(false), []),
    requestFillIdeas,
  }
}
