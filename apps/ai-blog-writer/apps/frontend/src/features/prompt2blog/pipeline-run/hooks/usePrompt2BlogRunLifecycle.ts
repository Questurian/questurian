import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { usePipelineRunPoll } from '../../../pipelineRuns/hooks/usePipelineRunPoll'
import { useTerminalPipelineRun } from '../../../pipelineRuns/hooks/useTerminalPipelineRun'
import {
  getPrompt2BlogStatus,
  type Prompt2BlogDebugStages,
  type Prompt2BlogStatusResponse,
  type Prompt2BlogPipelinePayload,
} from '../../api'
import { PIPELINE_STAGE_LABELS } from '../pipeline-status'
import type { PersistedRunState, PipelineLogLevel, SourceStep } from '../pipeline-run.types'
import { loadPrompt2BlogTerminalArtifacts } from './loadPrompt2BlogTerminalArtifacts'

type AppendPipelineLog = (message: string, level?: PipelineLogLevel) => void

type UsePrompt2BlogRunLifecycleOptions = {
  savedRun: MutableRefObject<PersistedRunState>
  sourceStep: SourceStep
  setSourceStep: Dispatch<SetStateAction<SourceStep>>
  pipelineRunId: string | null
  setPipelineResult: Dispatch<SetStateAction<Prompt2BlogPipelinePayload | null>>
  appendPipelineLog: AppendPipelineLog
  isStartingPipeline: boolean
}

export function usePrompt2BlogRunLifecycle({
  savedRun,
  sourceStep,
  setSourceStep,
  pipelineRunId,
  setPipelineResult,
  appendPipelineLog,
  isStartingPipeline,
}: UsePrompt2BlogRunLifecycleOptions) {
  const [pipelineStatus, setPipelineStatus] = useState<Prompt2BlogStatusResponse | null>(null)
  const [pipelineDebugData, setPipelineDebugData] = useState<Prompt2BlogDebugStages | null>(null)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [terminalResetKey, setTerminalResetKey] = useState(0)
  const lastStatusStageRef = useRef<string | null>(null)
  const lastStatusErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (savedRun.current.sourceStep !== 'pipeline_running' || !savedRun.current.pipelineRunId) return
    setLoadingLabel('Running final article pipeline...')
    appendPipelineLog(`Resumed run: ${savedRun.current.pipelineRunId}`)
  }, [appendPipelineLog, savedRun])

  useEffect(() => {
    if (isStartingPipeline) setLoadingLabel('Starting final article pipeline...')
  }, [isStartingPipeline])

  const statusQuery = usePipelineRunPoll({
    queryKey: ['prompt2blog-status', pipelineRunId],
    runId: pipelineRunId,
    fetchStatus: getPrompt2BlogStatus,
    enabled: sourceStep === 'pipeline_running',
    pollIntervalMs: 1200,
    errorPollIntervalMs: 2000,
  })

  const resetStatusError = useCallback(() => {
    lastStatusErrorRef.current = null
  }, [])

  const resetTerminalHandled = useCallback(() => {
    setTerminalResetKey(prev => prev + 1)
  }, [])

  const clearLifecycleState = useCallback(() => {
    setPipelineStatus(null)
    setPipelineDebugData(null)
    setLoadingLabel('')
    setError(null)
    lastStatusStageRef.current = null
    lastStatusErrorRef.current = null
  }, [])

  const handleStatusUpdate = useCallback((status: Prompt2BlogStatusResponse) => {
    setPipelineStatus(status)
    lastStatusErrorRef.current = null

    const stageKey = status.raw_stage || status.stage
    if (lastStatusStageRef.current === stageKey) return
    lastStatusStageRef.current = stageKey

    const stageLabel = status.stage === 'unknown' && status.raw_stage
      ? `Unknown pipeline stage: ${status.raw_stage}`
      : PIPELINE_STAGE_LABELS[status.stage] || status.stage
    appendPipelineLog(`Stage: ${stageLabel}`)
    setLoadingLabel(`Running: ${stageLabel}`)
  }, [appendPipelineLog])

  useEffect(() => {
    if (statusQuery.data) {
      handleStatusUpdate(statusQuery.data)
      return
    }

    if (!statusQuery.error) return
    const message = statusQuery.error instanceof Error
      ? statusQuery.error.message
      : 'Failed to poll pipeline status'
    if (lastStatusErrorRef.current === message) return
    lastStatusErrorRef.current = message
    appendPipelineLog(`Status polling error: ${message}`, 'error')
  }, [appendPipelineLog, handleStatusUpdate, statusQuery.data, statusQuery.error])

  const handleTerminalStatus = useCallback<
    (args: { status: Prompt2BlogStatusResponse; isCancelled: () => boolean }) => Promise<void>
  >(async ({ status, isCancelled }) => {
    if (!pipelineRunId) return

    if (status.state === 'completed') {
      const { result, debugPayload } = await loadPrompt2BlogTerminalArtifacts(pipelineRunId)
      if (isCancelled()) return
      if (result.artifact?.pipeline_v2) {
        setPipelineResult(result.artifact.pipeline_v2)
        const traceUrl = result.artifact.pipeline_v2.langsmith_trace_url || result.langsmith_trace_url
        if (traceUrl) appendPipelineLog(`LangSmith trace available: ${traceUrl}`)
      } else {
        setError('Pipeline finished but no final payload was returned.')
      }

      if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
      appendPipelineLog('Pipeline completed successfully.')
      setSourceStep('pipeline_complete')
      setLoadingLabel('')
      return
    }

    const failureMessage = status.error || 'Pipeline failed.'
    appendPipelineLog(
      `Pipeline failed at ${PIPELINE_STAGE_LABELS[status.stage] || status.stage}: ${failureMessage}`,
      'error',
    )
    setError(failureMessage)

    try {
      const { debugPayload } = await loadPrompt2BlogTerminalArtifacts(pipelineRunId, {
        includeResult: false,
        suppressDebugErrors: false,
      })
      if (isCancelled()) return
      if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
    } catch (err) {
      if (isCancelled()) return
      const message = err instanceof Error ? err.message : 'Failed to fetch pipeline debug payload'
      appendPipelineLog(`Pipeline debug fetch failed: ${message}`, 'error')
    }

    setSourceStep('edit')
    setLoadingLabel('')
  }, [appendPipelineLog, pipelineRunId, setPipelineResult, setSourceStep])

  const handleTerminalError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Failed to handle pipeline result'
    appendPipelineLog(`Pipeline result handling failed: ${message}`, 'error')
    setError(message)
    setLoadingLabel('')
  }, [appendPipelineLog])

  useTerminalPipelineRun({
    runId: pipelineRunId,
    status: statusQuery.data ?? null,
    enabled: sourceStep === 'pipeline_running',
    resetKey: terminalResetKey,
    onTerminal: handleTerminalStatus,
    onError: handleTerminalError,
  })

  return {
    pipelineStatus,
    pipelineDebugData,
    setPipelineDebugData,
    loadingLabel,
    setLoadingLabel,
    error,
    setError,
    resetStatusError,
    resetTerminalHandled,
    clearLifecycleState,
  }
}
