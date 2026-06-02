import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePipelineRunPoll } from '../../../pipelineRuns/hooks/usePipelineRunPoll'
import { useTerminalPipelineRun } from '../../../pipelineRuns/hooks/useTerminalPipelineRun'
import { buildStageArticleUrl } from '../../../blogArticles'
import {
  getPrompt2BlogDebug,
  getPrompt2BlogResult,
  getPrompt2BlogStatus,
  type Prompt2BlogDebugStages,
  type Prompt2BlogPipelinePayload,
  type Prompt2BlogRunRequest,
  type Prompt2BlogStatusResponse,
} from '../../api'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import { loadSavedRunState, RUN_STORAGE_KEY } from '../pipeline-run.storage'
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_ORDER } from '../pipeline-status'
import type {
  PersistedRunState,
  PipelineLogEntry,
  PipelineLogLevel,
  SourceStep,
} from '../pipeline-run.types'
import { usePrompt2BlogMutation } from './usePrompt2BlogMutation'

export function usePrompt2BlogPipelineRun(payload: Prompt2BlogRunRequest | null) {
  const savedRun = useRef(loadSavedRunState())
  const [sourceStep, setSourceStep] = useState<SourceStep>(savedRun.current.sourceStep)
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(savedRun.current.pipelineRunId)
  const [pipelineStatus, setPipelineStatus] = useState<Prompt2BlogStatusResponse | null>(null)
  const [pipelineResult, setPipelineResult] = useState<Prompt2BlogPipelinePayload | null>(
    savedRun.current.pipelineResult,
  )
  const [pipelineDebugData, setPipelineDebugData] = useState<Prompt2BlogDebugStages | null>(null)
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLogEntry[]>([])
  const [showPipelineDebug, setShowPipelineDebug] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
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
    const cleanupStageIndex = PIPELINE_STAGE_ORDER.indexOf(CLEANUP_STAGE_KEY)
    const currentStageIndex = pipelineStatus ? PIPELINE_STAGE_ORDER.indexOf(pipelineStatus.stage) : -1
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

  const run = useCallback(() => {
    setLoadingLabel('Starting final article pipeline...')
    setError(null)
    setPipelineResult(null)
    setPipelineStatus(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
    setShowPipelineDebug(false)
    lastStatusErrorRef.current = null

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
  }, [appendPipelineLog, resetStartPipeline, startPipeline])

  useEffect(() => {
    if (savedRun.current.sourceStep !== 'pipeline_running' || !savedRun.current.pipelineRunId) return
    setLoadingLabel('Running final article pipeline...')
    appendPipelineLog(`Resumed run: ${savedRun.current.pipelineRunId}`)
  }, [appendPipelineLog])

  useEffect(() => {
    if (isStartingPipeline) setLoadingLabel('Starting final article pipeline...')
  }, [isStartingPipeline])

  const reset = useCallback(() => {
    resetStartPipeline()
    setSourceStep('edit')
    setPipelineRunId(null)
    setPipelineStatus(null)
    setPipelineResult(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
    setShowPipelineDebug(false)
    setLoadingLabel('')
    setError(null)
    lastStatusErrorRef.current = null
    localStorage.removeItem(RUN_STORAGE_KEY)
  }, [resetStartPipeline])

  useEffect(() => {
    const persistedState: PersistedRunState = { sourceStep, pipelineRunId, pipelineResult }
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(persistedState))
  }, [sourceStep, pipelineRunId, pipelineResult])

  const statusQuery = usePipelineRunPoll({
    queryKey: ['prompt2blog-status', pipelineRunId],
    runId: pipelineRunId,
    fetchStatus: getPrompt2BlogStatus,
    enabled: sourceStep === 'pipeline_running',
    pollIntervalMs: 1200,
    errorPollIntervalMs: 2000,
  })

  useEffect(() => {
    const status = statusQuery.data
    if (!status) return
    setPipelineStatus(status)
    lastStatusErrorRef.current = null
  }, [statusQuery.data])

  useEffect(() => {
    const stage = statusQuery.data?.stage
    if (!stage) return
    const stageLabel = PIPELINE_STAGE_LABELS[stage] || stage
    appendPipelineLog(`Stage: ${stageLabel}`)
    setLoadingLabel(`Running: ${stageLabel}`)
  }, [appendPipelineLog, statusQuery.data?.stage])

  useEffect(() => {
    if (!statusQuery.error) return
    const message = statusQuery.error instanceof Error ? statusQuery.error.message : 'Failed to poll pipeline status'
    if (lastStatusErrorRef.current === message) return
    lastStatusErrorRef.current = message
    appendPipelineLog(`Status polling error: ${message}`, 'error')
  }, [appendPipelineLog, statusQuery.error])

  const handleTerminalStatus = useCallback<
    (args: { status: Prompt2BlogStatusResponse; isCancelled: () => boolean }) => Promise<void>
  >(async ({ status, isCancelled }) => {
    if (!pipelineRunId) return

    if (status.state === 'completed') {
      const result = await getPrompt2BlogResult(pipelineRunId)
      if (isCancelled()) return
      if (result.artifact?.pipeline_v2) {
        setPipelineResult(result.artifact.pipeline_v2)
        const traceUrl = result.artifact.pipeline_v2.langsmith_trace_url || result.langsmith_trace_url
        if (traceUrl) appendPipelineLog(`LangSmith trace available: ${traceUrl}`)
      } else {
        setError('Pipeline finished but no final payload was returned.')
      }

      const debugPayload = await getPrompt2BlogDebug(pipelineRunId).catch(() => null)
      if (isCancelled()) return
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
    const debugPayload = await getPrompt2BlogDebug(pipelineRunId).catch(() => null)
    if (isCancelled()) return
    if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
    setSourceStep('edit')
    setLoadingLabel('')
  }, [appendPipelineLog, pipelineRunId])

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
