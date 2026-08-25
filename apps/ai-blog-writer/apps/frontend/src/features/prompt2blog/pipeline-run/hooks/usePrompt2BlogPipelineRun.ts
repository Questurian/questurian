import { useCallback, useMemo, useState } from 'react'
import { buildStageArticleUrl } from '../../../blogArticles'
import {
  type Prompt2BlogRunRequest,
} from '../../api'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import { PROMPT2BLOG_PIPELINE_STAGES } from '../../types/pipeline.types'
import type {
  PipelineLogEntry,
  PipelineLogLevel,
} from '../pipeline-run.types'
import { usePersistedPipelineRunState } from './usePersistedPipelineRunState'
import { usePrompt2BlogMutation } from './usePrompt2BlogMutation'
import { usePrompt2BlogRunLifecycle } from './usePrompt2BlogRunLifecycle'

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
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLogEntry[]>([])
  const [showPipelineDebug, setShowPipelineDebug] = useState(false)

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

  const {
    isPending: isStartingPipeline,
    mutate: startPipeline,
    reset: resetStartPipeline,
  } = usePrompt2BlogMutation(payload)

  const {
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
  } = usePrompt2BlogRunLifecycle({
    savedRun,
    sourceStep,
    setSourceStep,
    pipelineRunId,
    setPipelineResult,
    appendPipelineLog,
    isStartingPipeline,
  })

  const canOpenCleanupModal = useMemo(() => {
    // Cleanup is a v2-only stage; a v3 stage name simply misses the order and
    // reads as -1, which is what "no cleanup to show" already means here.
    const v2StageOrder: readonly string[] = PROMPT2BLOG_PIPELINE_STAGES
    const cleanupStageIndex = v2StageOrder.indexOf(CLEANUP_STAGE_KEY)
    const currentStageIndex = pipelineStatus && pipelineStatus.stage !== 'unknown'
      ? v2StageOrder.indexOf(pipelineStatus.stage)
      : -1
    return Boolean(
      pipelineRunId
      && (sourceStep === 'pipeline_complete' || currentStageIndex >= cleanupStageIndex),
    )
  }, [pipelineRunId, pipelineStatus, sourceStep])

  const run = useCallback(() => {
    resetTerminalHandled()
    resetStatusError()
    setPipelineResult(null)
    clearLifecycleState()
    setLoadingLabel('Starting final article pipeline...')
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
  }, [
    appendPipelineLog,
    resetStartPipeline,
    resetStatusError,
    resetTerminalHandled,
    clearLifecycleState,
    setError,
    setLoadingLabel,
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
    setPipelineResult(null)
    clearLifecycleState()
    setPipelineLogs([])
    setShowPipelineDebug(false)
    resetStatusError()
    clearPersistedRunState()
  }, [
    clearLifecycleState,
    clearPersistedRunState,
    resetStartPipeline,
    resetStatusError,
    resetTerminalHandled,
    setPipelineResult,
    setPipelineRunId,
    setSourceStep,
  ])

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
