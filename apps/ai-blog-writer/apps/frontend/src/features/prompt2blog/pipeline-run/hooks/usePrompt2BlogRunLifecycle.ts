import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { usePipelineRunPoll, useTerminalPipelineRun } from '../../../pipelineRuns'
import {
  getPrompt2BlogResumePlan,
  getPrompt2BlogStatus,
  type Prompt2BlogDebugStages,
  type Prompt2BlogResumePlan,
  type Prompt2BlogStatusResponse,
} from '../../api'
import { PIPELINE_STAGE_LABELS, describePipelineFailure } from '../pipeline-status'
import type {
  PersistedPipelineResult,
  PersistedRunState,
  PipelineLogLevel,
  SourceStep,
} from '../pipeline-run.types'
import { loadPrompt2BlogTerminalArtifacts } from './loadPrompt2BlogTerminalArtifacts'

type AppendPipelineLog = (message: string, level?: PipelineLogLevel) => void

type UsePrompt2BlogRunLifecycleOptions = {
  savedRun: MutableRefObject<PersistedRunState>
  sourceStep: SourceStep
  setSourceStep: Dispatch<SetStateAction<SourceStep>>
  pipelineRunId: string | null
  setPipelineResult: Dispatch<SetStateAction<PersistedPipelineResult | null>>
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
  // Only ever set from a failed run. A resume is offered because the backend
  // said this run has stored work to continue from, never because the UI
  // guessed from the stage it stopped at.
  const [resumePlan, setResumePlan] = useState<Prompt2BlogResumePlan | null>(null)
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
    setResumePlan(null)
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
      // A run records exactly one payload, under the key naming the pipeline
      // that produced it. v3 is checked first so a new run does not have to
      // fall through the legacy branch, and v2 stays supported forever.
      const terminalResult: PersistedPipelineResult | null = result.artifact?.pipeline_v3
        ? { version: 'v3', payload: result.artifact.pipeline_v3 }
        : result.artifact?.pipeline_v2
          ? { version: 'v2', payload: result.artifact.pipeline_v2 }
          : null
      if (terminalResult) {
        setPipelineResult(terminalResult)
        const traceUrl =
          terminalResult.payload.langsmith_trace_url || result.langsmith_trace_url
        if (traceUrl) appendPipelineLog(`LangSmith trace available: ${traceUrl}`)
      } else {
        setError('Pipeline finished but no final payload was returned.')
      }

      if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
      setResumePlan(null)
      appendPipelineLog('Pipeline completed successfully.')
      setSourceStep('pipeline_complete')
      setLoadingLabel('')
      return
    }

    // Two audiences, two strings. The log keeps the backend's own sentence,
    // which is what a developer needs; the banner gets the plain-language one
    // built from the failure kind, which is what an operator needs.
    const loggedMessage = status.error || 'Pipeline failed.'
    appendPipelineLog(
      `Pipeline failed at ${PIPELINE_STAGE_LABELS[status.stage] || status.stage}: ${loggedMessage}`,
      'error',
    )
    setError(describePipelineFailure(status))

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

    // Asked after the failure is already on screen, and never allowed to
    // replace it: whether the run can be picked back up is extra information,
    // not the reason the run stopped.
    try {
      const plan = await getPrompt2BlogResumePlan(pipelineRunId)
      if (isCancelled()) return
      setResumePlan(plan)
      if (plan.resumable) {
        appendPipelineLog(
          `Saved work found: this run can continue from ${
            PIPELINE_STAGE_LABELS[plan.resume_from_stage as Prompt2BlogStatusResponse['stage']]
            || plan.resume_from_stage
          } instead of starting over.`,
        )
      }
    } catch (err) {
      if (isCancelled()) return
      const message = err instanceof Error ? err.message : 'Resume check failed'
      appendPipelineLog(`Resume check failed: ${message}`, 'error')
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
    resumePlan,
    setResumePlan,
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
