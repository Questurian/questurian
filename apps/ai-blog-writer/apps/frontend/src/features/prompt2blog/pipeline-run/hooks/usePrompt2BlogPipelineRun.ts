import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePipelineRunPoll } from '../../../pipelineRuns/hooks/usePipelineRunPoll'
import {
  getPrompt2BlogDebug,
  getPrompt2BlogResult,
  getPrompt2BlogStatus,
  startPrompt2BlogRun,
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
import { validatePipelinePayload } from '../validate-pipeline-payload'

export function usePrompt2BlogPipelineRun(payload: Prompt2BlogRunRequest) {
  const savedRun = useRef(loadSavedRunState())
  const [sourceStep, setSourceStep] = useState<SourceStep>(savedRun.current.sourceStep)
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(savedRun.current.pipelineRunId)
  const [pipelineStatus, setPipelineStatus] = useState<Prompt2BlogStatusResponse | null>(null)
  const [pipelineResult, setPipelineResult] = useState<Prompt2BlogPipelinePayload | null>(
    savedRun.current.pipelineResult,
  )
  const [pipelineDebugData, setPipelineDebugData] = useState<Record<string, unknown> | null>(null)
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLogEntry[]>([])
  const [showPipelineDebug, setShowPipelineDebug] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lastObservedStageRef = useRef<string | null>(null)
  const resumedRunLoggedRef = useRef(false)
  const handledTerminalRunRef = useRef<string | null>(null)
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

    return `/prompt2blog/stage-article?${new URLSearchParams({
      runId,
      title: pipelineResult.improved_article.title || 'Untitled',
      type: pipelineResult.article_type.name || '',
    }).toString()}`
  }, [pipelineResult, pipelineRunId])

  const canOpenCleanupModal = useMemo(() => {
    const cleanupStageIndex = PIPELINE_STAGE_ORDER.indexOf(CLEANUP_STAGE_KEY)
    const currentStageIndex = pipelineStatus
      ? PIPELINE_STAGE_ORDER.indexOf(
        (pipelineStatus.stage || 'queued') as (typeof PIPELINE_STAGE_ORDER)[number],
      )
      : -1
    return Boolean(
      pipelineRunId
      && (sourceStep === 'pipeline_complete' || currentStageIndex >= cleanupStageIndex),
    )
  }, [pipelineRunId, pipelineStatus, sourceStep])

  const run = useCallback(async () => {
    const validationError = validatePipelinePayload(payload)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsLoading(true)
    setLoadingLabel('Starting final article pipeline...')
    setError(null)
    setPipelineResult(null)
    setPipelineStatus(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
    setShowPipelineDebug(false)
    lastObservedStageRef.current = null
    resumedRunLoggedRef.current = false
    handledTerminalRunRef.current = null
    lastStatusErrorRef.current = null

    try {
      const startResponse = await startPrompt2BlogRun(payload)
      appendPipelineLog(`Pipeline started. Run ID: ${startResponse.run_id}`)
      setLoadingLabel('Running final article pipeline...')
      setPipelineRunId(startResponse.run_id)
      setSourceStep('pipeline_running')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start final pipeline'
      setError(message)
      appendPipelineLog(`Pipeline start failed: ${message}`, 'error')
      setIsLoading(false)
    }
  }, [appendPipelineLog, payload])

  const reset = useCallback(() => {
    setSourceStep('edit')
    setPipelineRunId(null)
    setPipelineStatus(null)
    setPipelineResult(null)
    setPipelineDebugData(null)
    setPipelineLogs([])
    setShowPipelineDebug(false)
    setIsLoading(false)
    setLoadingLabel('')
    setError(null)
    resumedRunLoggedRef.current = false
    handledTerminalRunRef.current = null
    lastStatusErrorRef.current = null
    localStorage.removeItem(RUN_STORAGE_KEY)
  }, [])

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

    if (status.stage && lastObservedStageRef.current !== status.stage) {
      lastObservedStageRef.current = status.stage
      const stageLabel = PIPELINE_STAGE_LABELS[status.stage] || status.stage
      appendPipelineLog(`Stage: ${stageLabel}`)
      setLoadingLabel(`Running: ${stageLabel}`)
    }
  }, [appendPipelineLog, statusQuery.data])

  useEffect(() => {
    if (!statusQuery.error) return
    const message = statusQuery.error instanceof Error ? statusQuery.error.message : 'Failed to poll pipeline status'
    if (lastStatusErrorRef.current === message) return
    lastStatusErrorRef.current = message
    appendPipelineLog(`Status polling error: ${message}`, 'error')
  }, [appendPipelineLog, statusQuery.error])

  useEffect(() => {
    const status = statusQuery.data
    if (!status || !pipelineRunId || sourceStep !== 'pipeline_running') return
    if (status.state !== 'completed' && status.state !== 'failed') return
    if (handledTerminalRunRef.current === `${pipelineRunId}:${status.state}`) return
    handledTerminalRunRef.current = `${pipelineRunId}:${status.state}`

    let cancelled = false

    const handleTerminalStatus = async () => {
      if (status.state === 'completed') {
        const result = await getPrompt2BlogResult(pipelineRunId)
        if (cancelled) return
        if (result.artifact?.pipeline_v2) {
          setPipelineResult(result.artifact.pipeline_v2)
          const traceUrl = result.artifact.pipeline_v2.langsmith_trace_url || result.langsmith_trace_url
          if (traceUrl) appendPipelineLog(`LangSmith trace available: ${traceUrl}`)
        } else {
          setError('Pipeline finished but no final payload was returned.')
        }

        const debugPayload = await getPrompt2BlogDebug(pipelineRunId).catch(() => null)
        if (cancelled) return
        if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
        appendPipelineLog('Pipeline completed successfully.')
        setSourceStep('pipeline_complete')
        setIsLoading(false)
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
      if (cancelled) return
      if (debugPayload?.stages) setPipelineDebugData(debugPayload.stages)
      setSourceStep('edit')
      setIsLoading(false)
      setLoadingLabel('')
    }

    handleTerminalStatus().catch((err) => {
      if (cancelled) return
      const message = err instanceof Error ? err.message : 'Failed to handle pipeline result'
      appendPipelineLog(`Pipeline result handling failed: ${message}`, 'error')
      setError(message)
      setIsLoading(false)
      setLoadingLabel('')
    })

    return () => {
      cancelled = true
    }
  }, [appendPipelineLog, pipelineRunId, sourceStep, statusQuery.data])

  useEffect(() => {
    if (sourceStep === 'pipeline_running' && !pipelineRunId) setSourceStep('edit')
    if (sourceStep === 'pipeline_complete' && !pipelineResult) setSourceStep('edit')
  }, [pipelineResult, pipelineRunId, sourceStep])

  useEffect(() => {
    if (sourceStep !== 'pipeline_running' || !pipelineRunId) return
    setIsLoading(true)
    if (!loadingLabel) setLoadingLabel('Running final article pipeline...')
    if (!resumedRunLoggedRef.current) {
      appendPipelineLog(`Resumed run: ${pipelineRunId}`)
      resumedRunLoggedRef.current = true
    }
  }, [appendPipelineLog, loadingLabel, pipelineRunId, sourceStep])

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
