import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePipelineRunPoll } from '../../../pipelineRuns/hooks/usePipelineRunPoll'
import { useTerminalPipelineRun } from '../../../pipelineRuns/hooks/useTerminalPipelineRun'
import { buildStageArticleUrl } from '../../../blogArticles'
import {
  getPrompt2BlogStatus,
  type Prompt2BlogDebugStages,
  type Prompt2BlogRunRequest,
  type Prompt2BlogStatusResponse,
} from '../../api'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import { PROMPT2BLOG_PIPELINE_STAGES, type KnownPrompt2BlogPipelineStage } from '../../types/pipeline.types'
import { PIPELINE_STAGE_LABELS } from '../pipeline-status'
import type {
  PipelineLogEntry,
  PipelineLogLevel,
} from '../pipeline-run.types'
import { loadPrompt2BlogTerminalArtifacts } from './loadPrompt2BlogTerminalArtifacts'
import { usePersistedPipelineRunState } from './usePersistedPipelineRunState'
import { usePrompt2BlogMutation } from './usePrompt2BlogMutation'

export function usePrompt2BlogPipelineRun(payload: Prompt2BlogRunRequest | null) {
  const {
    savedRun,
    sourceStep,
    setSourceStep,
    pipelineRunId,
    setPipelineRunId,
    pipelineResult,
    setPipelineResult,
    clearPersistedRunState,
  } = usePersistedPipelineRunState()
  const [pipelineStatus, setPipelineStatus] = useState<Prompt2BlogStatusResponse | null>(null)
  const [pipelineDebugData, setPipelineDebugData] = useState<Prompt2BlogDebugStages | null>(null)
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLogEntry[]>([])
  const [showPipelineDebug, setShowPipelineDebug] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [terminalResetKey, setTerminalResetKey] = useState(0)
  const lastStatusStageRef = useRef<string | null>(null)
  const lastStatusErrorRef = useRef<string | null>(null)

  const appendPipelineLog = useCallback((message: string, level: PipelineLogLevel = 'info') => {
    setPipelineLogs(prev => [
      ...prev,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        at: new Date().toLocaleTimeString(),
        level,
        message,
      },
    ])
  }, [])

  const stageArticleUrl = useMemo(() => {
    if (!pipelineResult) return null
    const runId = pipelineResult.run_id || pipelineRunId
    if (!runId) return null

    return buildStageArticleUrl('prompt2blog', {
      run_id: runId,
      title: pipelineResult.improved_article.title,
      article_type: pipelineResult.article_type.name,
    })
  }, [pipelineResult, pipelineRunId])

  const canOpenCleanupModal = useMemo(() => {
    const cleanupStageIndex = PROMPT2BLOG_PIPELINE_STAGES.indexOf(CLEANUP_STAGE_KEY)
    const currentStageIndex = pipelineStatus && pipelineStatus.stage !== 'unknown'
      ? PROMPT2BLOG_PIPELINE_STAGES.indexOf(pipelineStatus.stage as KnownPrompt2BlogPipelineStage)
      : -1
    return Boolean(
      pipelineRunId
      && (sourceStep === 'pipeline_complete' || currentStageIndex >= cleanupStageIndex),
    )
  }, [pipelineRunId, pipelineStatus, sourceStep])

  const {
    isPending: isStartingPipeline,
    mutate: startPipeline,
    reset: resetStartPipeline,
  } = usePrompt2BlogMutation(payload)

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

  const run = useCallback(() => {
    resetTerminalHandled()
    resetStatusError()
    setLoadingLabel('Starting final article pipeline...')
    setError(null)
    setPipelineResult(null)
    setPipelineStatus(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
    lastStatusStageRef.current = null
    setShowPipelineDebug(false)

    startPipeline(undefined, {
      onSuccess: (startResponse) => {
        resetStartPipeline()
        appendPipelineLog(`Pipeline started. Run ID: ${startResponse.run_id}`)
        setLoadingLabel('Running final article pipeline...')
        setPipelineRunId(startResponse.run_id)
        setSourceStep('pipeline_running')
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Failed to start final pipeline'
        resetStartPipeline()
        setError(message)
        appendPipelineLog(`Pipeline start failed: ${message}`, 'error')
        setLoadingLabel('')
      },
    })
  }, [
    appendPipelineLog,
    resetStartPipeline,
    resetStatusError,
    resetTerminalHandled,
    setPipelineResult,
    setPipelineRunId,
    setSourceStep,
    startPipeline,
  ])

  const reset = useCallback(() => {
    resetTerminalHandled()
    resetStartPipeline()
    setSourceStep('edit')
    setPipelineRunId(null)
    setPipelineStatus(null)
    setPipelineResult(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
    lastStatusStageRef.current = null
    setShowPipelineDebug(false)
    setLoadingLabel('')
    setError(null)
    resetStatusError()
    clearPersistedRunState()
  }, [
    clearPersistedRunState,
    resetStartPipeline,
    resetStatusError,
    resetTerminalHandled,
    setPipelineResult,
    setPipelineRunId,
    setSourceStep,
  ])

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
    const { debugPayload } = await loadPrompt2BlogTerminalArtifacts(pipelineRunId, { includeResult: false }).catch(() => ({
      result: null,
      debugPayload: null,
    }))
    if (isCancelled()) return
    if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
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

  const isLoading = isStartingPipeline || sourceStep === 'pipeline_running'

  return {
    sourceStep,
    pipelineRunId,
    pipelineStatus,
    pipelineResult,
    pipelineDebugData,
    setPipelineDebugData,
    pipelineLogs,
    showPipelineDebug,
    togglePipelineDebug: () => setShowPipelineDebug(prev => !prev),
    isLoading,
    loadingLabel,
    error,
    setError,
    stageArticleUrl,
    canOpenCleanupModal,
    run,
    reset,
  }
}
