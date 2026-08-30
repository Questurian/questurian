import { useCallback, useEffect, useState } from 'react'
import * as api from './intake.api'
import type { IntakeState } from './intake.types'

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
  cut: (struckIds: string[], added: string[]) => Promise<void>
  abandon: () => void
}

export function useIntake(): UseIntake {
  const [state, setState] = useState<IntakeState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cutWarnings, setCutWarnings] = useState<string[]>([])

  const run = useCallback(async (action: () => Promise<IntakeState>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await action()
      setState(next)
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
        setState(await api.readIntake(runId))
      } catch {
        // The run is gone, or belongs to someone else. Start clean rather than
        // stranding the page on an error it cannot act on.
        rememberRun(null)
      }
    })()
  }, [])

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
    cut: useCallback(
      (struckIds: string[], added: string[]) =>
        run(() => api.cutWorkOrder(requireRun(), struckIds, added)),
      [run, requireRun],
    ),
    abandon: useCallback(() => {
      rememberRun(null)
      setState(null)
      setCutWarnings([])
      setError(null)
    }, []),
  }
}
