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

/**
 * Runs `onTerminal` exactly once per (runId, state) when a polled status reaches a
 * terminal state. Async handlers receive an `isCancelled` guard so late awaits can
 * bail out if the run changed or the component unmounted — replacing the manual
 * `handledTerminalRunRef` + `cancelled` flag boilerplate feature hooks used to repeat.
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

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return
    previousResetKeyRef.current = resetKey
    handledRef.current = null
  }, [resetKey])

  useEffect(() => {
    if (!enabled || !status || !runId) return
    if (!terminalStates.includes(status.state)) return

    const handledKey = `${runId}:${status.state}`
    if (handledRef.current === handledKey) return
    handledRef.current = handledKey

    let cancelled = false
    Promise.resolve(
      onTerminal({ status, state: status.state, isCancelled: () => cancelled }),
    ).catch((error) => {
      if (!cancelled) onError?.(error)
    })

    return () => {
      cancelled = true
    }
  }, [enabled, runId, status, terminalStates, onTerminal, onError])

  const resetHandled = useCallback(() => {
    handledRef.current = null
  }, [])

  return { resetHandled }
}
