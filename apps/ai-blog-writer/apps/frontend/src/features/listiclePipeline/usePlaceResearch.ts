import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ResearchBlockedError,
  ResearchConflictError,
  loadResearchBoard,
  saveCandidatePrep,
  startPlaceResearch,
} from './api'
import type {
  ListicleResearchBoard,
  ListicleResearchCard,
  ListicleSourceLink,
} from './types'

/**
 * The research state of one run's board.
 *
 * One read for every card, kept here rather than in each card, because
 * readiness is a property of the run — a duplicate settled on one card changes
 * whether another one can be researched, and thirty-five cards each holding
 * their own copy of that cannot agree.
 *
 * Three things this hook refuses to do, each of which costs money:
 *
 * It never starts research on its own. Not on mount, not on reload, not
 * after a failure. A call happens when somebody presses the button.
 *
 * It never retries a lost response. If the answer does not arrive, the attempt
 * is already written down on the server; the card re-reads its state and says
 * what happened. "Try again" is a separate, explicit press with a new key.
 *
 * It never cancels a request in flight. Navigating away from the board while a
 * call is running would abandon something already charged for, so the fetch is
 * deliberately given no abort signal.
 */

/** How often the board is re-read while something is running. Slow enough to
 *  be invisible in the logs, fast enough that a call finishing feels like it
 *  finished. Stops the moment nothing is running. */
const POLL_MS = 2000

export type PrepPatch = {
  identity_confirmed?: boolean
  open_confirmed?: boolean
  status_note?: string
  exclusion_decision?: string
  exclusion_reason?: string
  cut_confirmed?: boolean
  tripadvisor_url?: string
  source_links?: ListicleSourceLink[]
}

export type SaveState = 'saving' | 'saved' | 'error'

export function usePlaceResearch(runId: string) {
  const [board, setBoard] = useState<ListicleResearchBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saves, setSaves] = useState<Record<string, SaveState>>({})
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  /** The card this tab is waiting on. Not the same as the run having an
   *  active attempt: another tab may hold it, and this tab must not draw that
   *  as its own button being pressed. */
  const [waitingFor, setWaitingFor] = useState<string | null>(null)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  const read = useCallback(async () => {
    try {
      const found = await loadResearchBoard(runId)
      if (live.current) {
        setBoard(found)
        setError(null)
      }
      return found
    } catch (caught) {
      if (live.current) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'The research board could not be read.',
        )
      }
      return null
    } finally {
      if (live.current) setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    setLoading(true)
    setBoard(null)
    void read()
  }, [read])

  // While anything is running — this tab's request or another's — the board is
  // re-read. A running attempt is the only thing on this screen that changes
  // without somebody doing something, so nothing polls when nothing is.
  const running = Boolean(board?.active_attempt?.running) || Boolean(waitingFor)
  useEffect(() => {
    if (!running) return undefined
    const timer = window.setInterval(() => void read(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [running, read])

  const savePrep = useCallback(
    async (candidateId: string, patch: PrepPatch) => {
      setSaves(current => ({ ...current, [candidateId]: 'saving' }))
      setSaveErrors(current => ({ ...current, [candidateId]: '' }))
      try {
        const saved = await saveCandidatePrep(runId, candidateId, patch)
        if (!live.current) return true
        setBoard(current =>
          current
            ? {
                ...current,
                cards: current.cards.map(card =>
                  card.candidate_id === candidateId
                    ? { ...card, prep: saved.prep, readiness: saved.readiness }
                    : card,
                ),
              }
            : current,
        )
        setSaves(current => ({ ...current, [candidateId]: 'saved' }))
        return true
      } catch (caught) {
        if (!live.current) return false
        setSaves(current => ({ ...current, [candidateId]: 'error' }))
        setSaveErrors(current => ({
          ...current,
          [candidateId]:
            caught instanceof Error ? caught.message : 'That could not be saved.',
        }))
        // A conflict means somebody else moved this card. Re-read rather than
        // leaving the screen arguing with a version that no longer exists.
        if (caught instanceof ResearchConflictError) void read()
        return false
      }
    },
    [runId, read],
  )

  const research = useCallback(
    async (
      candidateId: string,
      options: { mode?: 'initial' | 'gap' | 'refresh'; gapText?: string } = {},
    ) => {
      const card = board?.cards.find(one => one.candidate_id === candidateId)
      // A key for THIS press. A lost response and a retried request share it;
      // pressing Try again makes a new one, which is what makes "try again"
      // honest about costing something.
      const key = `${runId}-${candidateId}-${Date.now().toString(36)}`.slice(0, 80)
      setWaitingFor(candidateId)
      setSaveErrors(current => ({ ...current, [candidateId]: '' }))
      try {
        const result = await startPlaceResearch(runId, candidateId, {
          idempotency_key: key,
          expected_prep_version: card?.prep.version,
          expected_order_revision: board?.revision,
          mode: options.mode ?? 'initial',
          gap_text: options.gapText ?? '',
        })
        await read()
        return result
      } catch (caught) {
        if (caught instanceof ResearchBlockedError) {
          setSaveErrors(current => ({ ...current, [candidateId]: caught.message }))
        } else {
          setSaveErrors(current => ({
            ...current,
            [candidateId]:
              caught instanceof Error
                ? `${caught.message} Nothing was retried; the card shows how the request ended.`
                : 'The research request did not come back.',
          }))
        }
        // Whatever went wrong, the attempt was written down before the call
        // went out. Re-reading is how the card learns what became of it.
        await read()
        return null
      } finally {
        if (live.current) setWaitingFor(null)
      }
    },
    [board, runId, read],
  )

  const cardFor = useCallback(
    (candidateId: string): ListicleResearchCard | undefined =>
      board?.cards.find(card => card.candidate_id === candidateId),
    [board],
  )

  return {
    board,
    loading,
    error,
    saves,
    saveErrors,
    waitingFor,
    savePrep,
    research,
    cardFor,
    refresh: read,
  }
}
