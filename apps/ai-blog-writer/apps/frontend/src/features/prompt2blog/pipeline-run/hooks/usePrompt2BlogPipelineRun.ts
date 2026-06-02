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
import { PROMPT2BLOG_PIPELINE_STAGES } from '../../types/pipeline.types'
import { PIPELINE_STAGE_LABELS } from '../pipeline-status'
import type {
  PipelineLogEntry,
  PipelineLogLevel,
} from '../pipeline-run.types'
import { loadPrompt2BlogTerminalArtifacts } from './loadPrompt2BlogTerminalArtifacts'
import { usePersistedPipelineRunState } from './usePersistedPipelineRunState'
import { usePipelineStatusSideEffects } from './usePipelineStatusSideEffects'
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
  const resetTerminalHandledRef = useRef<() => void>(() => undefined)

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
    const currentStageIndex = pipelineStatus ? PROMPT2BLOG_PIPELINE_STAGES.indexOf(pipelineStatus.stage) : -1
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
  }, [appendPipelineLog])

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

  useEffect(() => {
    const status = statusQuery.data
    if (!status) return
    setPipelineStatus(status)
  }, [statusQuery.data])

  const { resetStatusError } = usePipelineStatusSideEffects({
    status: statusQuery.data,
    error: statusQuery.error,
    labels: PIPELINE_STAGE_LABELS,
    appendLog: appendPipelineLog,
    setLoadingLabel,
  })

  const run = useCallback(() => {
    resetTerminalHandledRef.current()
    resetStatusError()
    setLoadingLabel('Starting final article pipeline...')
    setError(null)
    setPipelineResult(null)
    setPipelineStatus(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
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
  }, [appendPipelineLog, resetStartPipeline, resetStatusError, startPipeline])

  const reset = useCallback(() => {
    resetTerminalHandledRef.current()
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
    resetStatusError()
    clearPersistedRunState()
  }, [clearPersistedRunState, resetStartPipeline, resetStatusError])

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
  }, [appendPipelineLog, pipelineRunId])

  const handleTerminalError = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Failed to handle pipeline result'
    appendPipelineLog(`Pipeline result handling failed: ${message}`, 'error')
    setError(message)
    setLoadingLabel('')
  }, [appendPipelineLog])

  const { resetHandled } = useTerminalPipelineRun({
    runId: pipelineRunId,
    status: statusQuery.data ?? null,
    enabled: sourceStep === 'pipeline_running',
    onTerminal: handleTerminalStatus,
    onError: handleTerminalError,
  })
  resetTerminalHandledRef.current = resetHandled

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
