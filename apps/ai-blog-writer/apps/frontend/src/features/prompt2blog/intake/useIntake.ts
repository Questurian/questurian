import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './intake.api'
import type { IntakeArticle, IntakeState } from './intake.types'

/**
 * One article's intake, from a typed line to a cut research plan.
 *
 * The run holds the state, not this hook. Every call replaces what is on
 * screen with what the server says, so a reload or a second tab cannot show a
 * different story to the same run.
 *
 * The run id is remembered so closing the tab does not abandon the work —
 * which is the whole reason a run is created at the seed rather than at the
 * point of writing.
 */

const RESUME_KEY = 'p2b.intake.runId'

function rememberRun(runId: string | null): void {
  try {
    if (runId) window.localStorage.setItem(RESUME_KEY, runId)
    else window.localStorage.removeItem(RESUME_KEY)
  } catch {
    // A private window can refuse storage. Losing the pointer costs a resume,
    // not the work: the run is on the server either way.
  }
}

function rememberedRun(): string | null {
  // `?run=<id>` wins over the remembered pointer, so any run is a bookmark.
  // Starting a second article used to make the first unreachable from the UI
  // even though every stage of it was still on the server — which meant
  // re-interviewing from scratch to test anything downstream of the grill.
  try {
    const asked = new URLSearchParams(window.location.search).get('run')
    if (asked) return asked
  } catch {
    // A malformed query string is not a reason to lose the remembered run.
  }
  try {
    return window.localStorage.getItem(RESUME_KEY)
  } catch {
    return null
  }
}

export interface UseIntake {
  state: IntakeState | null
  busy: boolean
  error: string | null
  /** What the last cut cost, until the next move. */
  cutWarnings: string[]
  start: (seed: string) => Promise<void>
  answer: (text: string) => Promise<void>
  reopen: () => Promise<void>
  approveBrief: () => Promise<void>
  planResearch: () => Promise<void>
  research: () => Promise<void>
  cut: (struckIds: string[], added: string[]) => Promise<void>
  /** Hand the settled run to the writer. */
  write: () => Promise<void>
  /** The finished article, once there is one. */
  article: IntakeArticle | null
  abandon: () => void
}

export function useIntake(): UseIntake {
  const [state, setState] = useState<IntakeState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cutWarnings, setCutWarnings] = useState<string[]>([])
  const [article, setArticle] = useState<IntakeArticle | null>(null)
  // Held in a ref as well as state so the poll below reads the current run
  // without restarting its own interval every time the state changes.
  const runIdRef = useRef<string | null>(null)

  const run = useCallback(async (action: () => Promise<IntakeState>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      setState(next)
      runIdRef.current = next.run_id
      rememberRun(next.run_id)
      setCutWarnings(next.cut_warnings ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const runId = rememberedRun()
    if (!runId) return
    void (async () => {
      try {
        const restored = await api.readIntake(runId)
        setState(restored)
        runIdRef.current = restored.run_id
      } catch {
        // The run is gone, or belongs to someone else. Start clean rather than
        // stranding the page on an error it cannot act on.
        rememberRun(null)
      }
    })()
  }, [])

  // Research is ten sequential web searches and writing is a whole article, and
  // both used to leave the page silent for as long as they took. The run knows
  // exactly where it is; this asks.
  const writingRun = state?.writing?.state === 'running'
  const researching = busy && state?.step === 'work_order'
  const shouldPoll = writingRun || researching

  useEffect(() => {
    if (!shouldPoll) return
    const timer = window.setInterval(() => {
      const runId = runIdRef.current
      if (!runId) return
      void api
        .readIntake(runId)
        .then(setState)
        // A poll that fails changes nothing on screen. The work is on the
        // server and the next tick will ask again.
        .catch(() => undefined)
    }, 3_000)
    return () => window.clearInterval(timer)
  }, [shouldPoll])

  // Fetched once, when there is something to read.
  const finishedRunId = state?.writing?.state === 'completed' ? state.run_id : null
  useEffect(() => {
    if (!finishedRunId) return
    void api
      .readArticle(finishedRunId)
      .then(setArticle)
      .catch(() => undefined)
  }, [finishedRunId])

  const requireRun = useCallback((): string => {
    if (!state?.run_id) throw new Error('No article in progress.')
    return state.run_id
  }, [state])

  return {
    state,
    busy,
    error,
    cutWarnings,
    start: useCallback((seed: string) => run(() => api.openIntake(seed)), [run]),
    answer: useCallback(
      (text: string) => run(() => api.answerQuestion(requireRun(), text)),
      [run, requireRun],
    ),
    reopen: useCallback(() => run(() => api.reopenGrill(requireRun())), [run, requireRun]),
    approveBrief: useCallback(
      () => run(() => api.approveBrief(requireRun())),
      [run, requireRun],
    ),
    planResearch: useCallback(
      () => run(() => api.planResearch(requireRun())),
      [run, requireRun],
    ),
    research: useCallback(() => run(() => api.doResearch(requireRun())), [run, requireRun]),
    cut: useCallback(
      (struckIds: string[], added: string[]) =>
        run(() => api.cutWorkOrder(requireRun(), struckIds, added)),
      [run, requireRun],
    ),
    write: useCallback(() => run(() => api.startWriting(requireRun())), [run, requireRun]),
    article,
    abandon: useCallback(() => {
      rememberRun(null)
      runIdRef.current = null
      setState(null)
      setArticle(null)
      setCutWarnings([])
      setError(null)
    }, []),
  }
}
