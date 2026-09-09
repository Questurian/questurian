import { useCallback, useEffect, useRef, useState } from 'react'
import {
  NotFoundError,
  answerGrill,
  loadGrill,
  loadOrder,
  loadSearch,
  reviseOrder,
  runSearch,
  startGrill,
} from './api'
import type {
  ListicleAngleSelection,
  ListicleGrillState,
  ListicleOrder,
  ListicleSearchResults,
} from './types'

/**
 * The listicle interview, driven by the server and addressed by its run id.
 *
 * There is no local copy of the conversation: every move posts and replaces
 * the whole state with what came back. The interview lives on the run, so a
 * closed tab is not a lost interview -- the same reason the article grill
 * persists per turn rather than holding the thread in a browser.
 *
 * That was already true of the storage and was not true of the screen. The run
 * id existed only in this hook's memory, so a refresh landed on an empty seed
 * box with a paid, agreed, searched run sitting in the database and no way to
 * reach it. The id is now in the URL and this hook loads whatever it is given.
 *
 * Each turn is a live model call and takes a few seconds, so `busy` is what
 * the screen disables itself on.
 */

interface UseListicleGrill {
  state: ListicleGrillState | null
  order: ListicleOrder | null
  results: ListicleSearchResults | null
  busy: boolean
  /** Set only while the searches are running. They take minutes where a grill
   *  turn takes seconds, and a screen that says "working" for both tells the
   *  operator nothing about how long to wait. */
  searching: boolean
  /** Set while an existing run is being read. Distinct from `busy`: nothing is
   *  being spent, and the screen must not offer to start a second interview
   *  while it does not yet know whether this one exists. */
  loading: boolean
  /** The run in the URL is not there. A different problem from a failed read,
   *  and it has a different next step. */
  missing: boolean
  error: string | null
  start: (seed: string) => void
  answer: (text: string, selections?: ListicleAngleSelection[]) => void
  search: (options?: { angleIds?: string[]; reuse?: boolean }) => void
  correctCount: (target: number) => void
  /** The bar or the cut, typed out. Needed because either can have been
   *  assembled from more than one answer, and an assembled value has to be
   *  arguable. */
  correctRequirements: (patch: { standard?: string; exclusions?: string }) => void
  reset: () => void
}

export function useListicleGrill(runId: string | null): UseListicleGrill {
  const [state, setState] = useState<ListicleGrillState | null>(null)
  const [order, setOrder] = useState<ListicleOrder | null>(null)
  const [results, setResults] = useState<ListicleSearchResults | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Which run this screen is currently showing. Read inside every async
  // callback before it writes: switching runs while a slow read is in flight
  // used to let the old run's answer land on the new run's screen, which is
  // the one failure mode a resumable page adds that a disposable one never
  // had.
  const showing = useRef<string | null>(runId)
  showing.current = runId

  const run = useCallback(
    async (id: string | null, work: () => Promise<ListicleGrillState>) => {
      setBusy(true)
      setError(null)
      try {
        const next = await work()
        if (id !== null && showing.current !== id) return
        setState(next)
      } catch (caught) {
        if (id !== null && showing.current !== id) return
        // Said on the screen rather than swallowed: a failed turn leaves the
        // interview exactly where it was, and the operator has to be able to
        // tell that from a turn that simply had nothing to ask.
        setError(caught instanceof Error ? caught.message : 'That turn failed.')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const start = useCallback(
    (seed: string) => {
      if (!seed.trim()) return
      void run(null, () => startGrill(seed.trim()))
    },
    [run],
  )

  const answer = useCallback(
    (text: string, selections: ListicleAngleSelection[] = []) => {
      const id = state?.run_id
      if (!id || !text.trim()) return
      void run(id, () => answerGrill(id, text.trim(), selections))
    },
    [run, state?.run_id],
  )

  // Reopening a run reads it. It never searches: opening a screen is not a
  // decision to spend, and the version this replaced could not tell "never
  // searched" from "not read yet" -- so a reload offered to buy the research
  // again.
  useEffect(() => {
    if (!runId) {
      setMissing(false)
      return
    }
    if (state?.run_id === runId) return
    let live = true
    setLoading(true)
    setMissing(false)
    setError(null)
    setResults(null)
    setOrder(null)
    void (async () => {
      try {
        const found = await loadGrill(runId)
        if (!live || showing.current !== runId) return
        setState(found)
      } catch (caught) {
        if (!live || showing.current !== runId) return
        if (caught instanceof NotFoundError) {
          setMissing(true)
        } else {
          setError(
            caught instanceof Error ? caught.message : 'That run could not be read.',
          )
        }
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [runId, state?.run_id])

  // The agreement and whatever the searches have already found, read once the
  // interview has settled. Both are reads and neither costs anything.
  useEffect(() => {
    const id = state?.run_id
    if (!id || state?.status !== 'agreed') return
    let live = true
    void (async () => {
      try {
        const [found, stored] = await Promise.all([loadOrder(id), loadSearch(id)])
        if (!live || showing.current !== id) return
        setOrder(found)
        if (stored) setResults(stored)
      } catch (caught) {
        if (!live || showing.current !== id) return
        // A read that fails is not the same as nothing being there, and
        // treating it as "never searched" is how an operator is invited to
        // pay twice for the same research.
        setError(
          caught instanceof Error
            ? caught.message
            : 'The stored results could not be read.',
        )
      }
    })()
    return () => {
      live = false
    }
  }, [state?.run_id, state?.status])

  const search = useCallback(
    (options: { angleIds?: string[]; reuse?: boolean } = {}) => {
      const id = state?.run_id
      if (!id || searching) return
      setSearching(true)
      setError(null)
      void (async () => {
        try {
          const found = await runSearch(id, options)
          if (showing.current !== id) return
          setResults(found)
        } catch (caught) {
          if (showing.current !== id) return
          setError(caught instanceof Error ? caught.message : 'The search failed.')
        } finally {
          setSearching(false)
        }
      })()
    },
    [searching, state?.run_id],
  )

  // One correction path, whatever is being corrected. The count, the bar and
  // the cut all make a new revision and all invalidate stored results the same
  // way, and a second copy of that sequence is a second place for the re-read
  // to be forgotten.
  const correctOrder = useCallback(
    (patch: { target_count?: number; standard?: string; exclusions?: string }) => {
      const id = state?.run_id
      if (!id) return
      setError(null)
      void (async () => {
        try {
          const revised = await reviseOrder(id, patch)
          if (showing.current !== id) return
          setOrder(revised)
          // The results on screen answered the previous request. Re-read
          // rather than left standing: some of them still answer this one and
          // some of them do not, and the server is what knows which.
          const stored = await loadSearch(id)
          if (showing.current === id) setResults(stored)
        } catch (caught) {
          if (showing.current !== id) return
          setError(
            caught instanceof Error ? caught.message : 'That correction failed.',
          )
        }
      })()
    },
    [state?.run_id],
  )

  const correctCount = useCallback(
    (target: number) => correctOrder({ target_count: target }),
    [correctOrder],
  )

  const reset = useCallback(() => {
    setState(null)
    setOrder(null)
    setResults(null)
    setError(null)
    setMissing(false)
  }, [])

  return {
    state,
    order,
    results,
    busy,
    searching,
    loading,
    missing,
    error,
    start,
    answer,
    search,
    correctCount,
    correctRequirements: correctOrder,
    reset,
  }
}

export type { UseListicleGrill }
