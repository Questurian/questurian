import { useCallback, useEffect, useState } from 'react'
import { answerGrill, loadSearch, runSearch, startGrill } from './api'
import type { ListicleGrillState, ListicleSearchResults } from './types'

/**
 * The listicle interview, driven by the server.
 *
 * There is no local copy of the conversation: every move posts and replaces
 * the whole state with what came back. The interview lives on the run, so a
 * closed tab is not a lost interview -- the same reason the article grill
 * persists per turn rather than holding the thread in a browser.
 *
 * Each turn is a live model call and takes a few seconds, so `busy` is what
 * the screen disables itself on.
 */

interface UseListicleGrill {
  state: ListicleGrillState | null
  results: ListicleSearchResults | null
  busy: boolean
  /** Set only while the searches are running. They take minutes where a grill
   *  turn takes seconds, and a screen that says "working" for both tells the
   *  operator nothing about how long to wait. */
  searching: boolean
  error: string | null
  start: (seed: string) => void
  answer: (text: string) => void
  search: () => void
  reset: () => void
}

export function useListicleGrill(): UseListicleGrill {
  const [state, setState] = useState<ListicleGrillState | null>(null)
  const [results, setResults] = useState<ListicleSearchResults | null>(null)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (work: () => Promise<ListicleGrillState>) => {
    setBusy(true)
    setError(null)
    try {
      setState(await work())
    } catch (caught) {
      // Said on the screen rather than swallowed: a failed turn leaves the
      // interview exactly where it was, and the operator has to be able to
      // tell that from a turn that simply had nothing to ask.
      setError(caught instanceof Error ? caught.message : 'That turn failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const start = useCallback(
    (seed: string) => {
      if (!seed.trim()) return
      void run(() => startGrill(seed.trim()))
    },
    [run],
  )

  const answer = useCallback(
    (text: string) => {
      const runId = state?.run_id
      if (!runId || !text.trim()) return
      void run(() => answerGrill(runId, text.trim()))
    },
    [run, state?.run_id],
  )

  // Running the order is minutes of grounded searching, so it is never done
  // on a screen opening -- it looks for what a previous run stored first, and
  // only searches when there is nothing there or the operator asks again.
  const search = useCallback(() => {
    const runId = state?.run_id
    if (!runId || searching) return
    setSearching(true)
    setError(null)
    void (async () => {
      try {
        setResults(await runSearch(runId))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The search failed.')
      } finally {
        setSearching(false)
      }
    })()
  }, [searching, state?.run_id])

  // An agreed interview may already have results behind it, from this session
  // or another one. Read them before offering to spend on new ones.
  useEffect(() => {
    const runId = state?.run_id
    if (!runId || state?.status !== 'agreed' || results) return
    void loadSearch(runId)
      .then(found => {
        if (found) setResults(found)
      })
      .catch(() => {
        // Nothing stored is the normal case, and it is not an error worth
        // putting on the screen: the button to run them is right there.
      })
  }, [results, state?.run_id, state?.status])

  const reset = useCallback(() => {
    setState(null)
    setResults(null)
    setError(null)
  }, [])

  return { state, results, busy, searching, error, start, answer, search, reset }
}
