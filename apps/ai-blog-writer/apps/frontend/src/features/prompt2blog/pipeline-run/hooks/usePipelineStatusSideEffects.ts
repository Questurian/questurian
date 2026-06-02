import { useCallback, useEffect, useRef } from 'react'
import type { Prompt2BlogStatusResponse } from '../../api'
import type { PipelineLogLevel } from '../pipeline-run.types'

type UsePipelineStatusSideEffectsOptions = {
  status: Prompt2BlogStatusResponse | null | undefined
  error: unknown
  labels: Record<string, string>
  appendLog: (message: string, level?: PipelineLogLevel) => void
  setLoadingLabel: (label: string) => void
}

export function usePipelineStatusSideEffects({
  status,
  error,
  labels,
  appendLog,
  setLoadingLabel,
}: UsePipelineStatusSideEffectsOptions) {
  const lastStatusErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!status) return
    lastStatusErrorRef.current = null
  }, [status])

  useEffect(() => {
    const stage = status?.stage
    if (!stage) return
    const stageLabel = labels[stage] || stage
    appendLog(`Stage: ${stageLabel}`)
    setLoadingLabel(`Running: ${stageLabel}`)
  }, [appendLog, labels, setLoadingLabel, status?.stage])

  useEffect(() => {
    if (!error) return
    const message = error instanceof Error ? error.message : 'Failed to poll pipeline status'
    if (lastStatusErrorRef.current === message) return
    lastStatusErrorRef.current = message
    appendLog(`Status polling error: ${message}`, 'error')
  }, [appendLog, error])

  return {
    resetStatusError: useCallback(() => {
      lastStatusErrorRef.current = null
    }, []),
  }
}
