import { useCallback, useEffect, useRef } from 'react'
import type { PipelineRunStatus } from './usePipelineRunPoll'

export type TerminalRunHandler<TStatus> = (args: {
  status: TStatus
  state: string
  isCancelled: () => boolean
}) => Promise<void> | void

export type UseTerminalPipelineRunOptions<TStatus extends PipelineRunStatus> = {
  runId: string | null
  status: TStatus | null
  enabled?: boolean
  resetKey?: unknown
  terminalStates?: readonly string[]
  onTerminal: TerminalRunHandler<TStatus>
  onError?: (error: unknown) => void
}

type InFlightHandler = { cancelled: boolean }

/**
 * Runs `onTerminal` exactly once per (runId, state) when a polled status reaches a
 * terminal state. Async handlers receive an `isCancelled` guard so late awaits can
 * bail out if the run changed or the component unmounted — replacing the manual
 * `handledTerminalRunRef` + `cancelled` flag boilerplate feature hooks used to repeat.
 *
 * Cancellation is deliberately tied to the run being watched (runId / enabled /
 * reset / unmount) rather than to effect re-runs. A terminal handler typically
 * awaits a result fetch while its own `setState` calls re-render the caller, so
 * cancelling on every re-render would abandon the handler mid-flight and leave
 * the UI stuck on the last stage.
 */
export function useTerminalPipelineRun<TStatus extends PipelineRunStatus>({
  runId,
  status,
  enabled = true,
  resetKey,
  terminalStates = ['completed', 'failed'],
  onTerminal,
  onError,
}: UseTerminalPipelineRunOptions<TStatus>) {
  const handledRef = useRef<string | null>(null)
  const previousResetKeyRef = useRef(resetKey)
  const inFlightRef = useRef<InFlightHandler | null>(null)
  const handlersRef = useRef({ onTerminal, onError, terminalStates })
  handlersRef.current = { onTerminal, onError, terminalStates }

  const cancelInFlight = useCallback(() => {
    if (!inFlightRef.current) return
    inFlightRef.current.cancelled = true
    inFlightRef.current = null
    // A cancelled attempt never finished its work, so drop the guard and let the
    // next effect pass dispatch again (StrictMode's mount/remount, `enabled`
    // flipping back on). Handlers that ran to completion clear `inFlightRef`
    // themselves and keep their guard, so they are never dispatched twice.
    handledRef.current = null
  }, [])

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return
    previousResetKeyRef.current = resetKey
    handledRef.current = null
    cancelInFlight()
  }, [cancelInFlight, resetKey])

  // Declared before the dispatch effect so its cleanup cancels the previous
  // run's handler before a new one starts.
  useEffect(() => cancelInFlight, [cancelInFlight, enabled, runId])

  // Callers pass an inline array literal, so depend on its contents rather than
  // its identity — otherwise the effect re-runs on every render.
  const terminalStatesKey = terminalStates.join('|')

  useEffect(() => {
    if (!enabled || !status || !runId) return
    if (!handlersRef.current.terminalStates.includes(status.state)) return

    const handledKey = `${runId}:${status.state}`
    if (handledRef.current === handledKey) return
    handledRef.current = handledKey

    const handler: InFlightHandler = { cancelled: false }
    inFlightRef.current = handler

    Promise.resolve(
      handlersRef.current.onTerminal({
        status,
        state: status.state,
        isCancelled: () => handler.cancelled,
      }),
    )
      .catch((error) => {
        if (!handler.cancelled) handlersRef.current.onError?.(error)
      })
      .finally(() => {
        if (inFlightRef.current === handler) inFlightRef.current = null
      })
  }, [enabled, resetKey, runId, status, terminalStatesKey])

  const resetHandled = useCallback(() => {
    handledRef.current = null
    cancelInFlight()
  }, [cancelInFlight])

  return { resetHandled }
}
