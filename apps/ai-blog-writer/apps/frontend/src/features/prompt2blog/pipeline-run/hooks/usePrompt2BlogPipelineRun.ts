import { useCallback, useMemo, useState } from 'react'
import { buildStageArticleUrl } from '../../../blogArticles'
import {
  resumePrompt2BlogRun,
  type Prompt2BlogV3NeedsResearchResponse,
  type Prompt2BlogV3Request,
} from '../../api'
import { CLEANUP_STAGE_KEY } from '../../cleanup-details/cleanup-stage.parser'
import {
  PROMPT2BLOG_PIPELINE_STAGES,
  PROMPT2BLOG_V3_PIPELINE_STAGES,
} from '../../types/pipeline.types'
import type {
  PipelineLogEntry,
  PipelineLogLevel,
  PipelineVersion,
} from '../pipeline-run.types'
import { usePersistedPipelineRunState } from './usePersistedPipelineRunState'
import { usePrompt2BlogMutation } from './usePrompt2BlogMutation'
import { usePrompt2BlogRunLifecycle } from './usePrompt2BlogRunLifecycle'

type Prompt2BlogPipelineRunOptions = {
  v3Payload: Prompt2BlogV3Request | null
  v3BlockedReason?: string | null
}

export function usePrompt2BlogPipelineRun({
  v3Payload,
  v3BlockedReason,
}: Prompt2BlogPipelineRunOptions) {
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
  const [needsResearch, setNeedsResearch] = useState<Prompt2BlogV3NeedsResearchResponse | null>(
    null,
  )

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
    const { payload } = pipelineResult
    const runId = payload.run_id || pipelineRunId
    if (!runId) return null

    // Staging keeps one `article_type` slot. v2 fills it with the shared
    // 42-type name; v3 fills it with the approved article form's label, which
    // is the equivalent editorial shape under the new model. Old staging URLs
    // keep working because the slot and the route are unchanged.
    const articleType = pipelineResult.version === 'v3'
      ? pipelineResult.payload.form.label
        || pipelineResult.payload.instruction_meta.form_label
        || ''
      : pipelineResult.payload.article_type.name

    return buildStageArticleUrl('prompt2blog', {
      run_id: runId,
      title: payload.improved_article.title,
      article_type: articleType,
    })
  }, [pipelineResult, pipelineRunId])

  const {
    isPending: isStartingPipeline,
    mutate: startPipeline,
    reset: resetStartPipeline,
  } = usePrompt2BlogMutation({ v3Payload, v3BlockedReason })

  const {
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
  } = usePrompt2BlogRunLifecycle({
    savedRun,
    sourceStep,
    setSourceStep,
    pipelineRunId,
    setPipelineResult,
    appendPipelineLog,
    isStartingPipeline,
  })

  // Which pipeline's stage list to show. A finished run names its own version.
  // Nothing else can name one: this app can only start v3 runs, so the list an
  // operator reads before and during a run is the v3 list. Defaulting to v2
  // meant every pre-run page described the retired pipeline's stages.
  //
  // The exception is a run restored from storage that predates the cutover. It
  // reports v2 stage names, and reading those against the v3 order would place
  // every step at -1 and stall the whole list, so it keeps the v2 list.
  const pipelineVersion: PipelineVersion = useMemo(() => {
    if (pipelineResult) return pipelineResult.version
    const stage = pipelineStatus && pipelineStatus.stage !== 'unknown' ? pipelineStatus.stage : null
    const isLegacyStage =
      stage !== null
      && !(PROMPT2BLOG_V3_PIPELINE_STAGES as readonly string[]).includes(stage)
      && (PROMPT2BLOG_PIPELINE_STAGES as readonly string[]).includes(stage)
    return isLegacyStage ? 'v2' : 'v3'
  }, [pipelineResult, pipelineStatus])

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
    setNeedsResearch(null)

    startPipeline(undefined, {
      onSuccess: (outcome) => {
        resetStartPipeline()
        if (outcome.kind === 'needs_research') {
          // The gate stopped before any writing work existed. Stay on the edit
          // step so the research panel is still there to take a replacement
          // package.
          setNeedsResearch(outcome.payload)
          appendPipelineLog(
            `Run not started: research is incomplete (${outcome.payload.findings.length} finding${
              outcome.payload.findings.length === 1 ? '' : 's'
            }).`,
          )
          setLoadingLabel('')
          setSourceStep('edit')
          return
        }
        appendPipelineLog(`Pipeline started. Run ID: ${outcome.runId}`)
        setLoadingLabel('Running final article pipeline...')
        setPipelineRunId(outcome.runId)
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

  /**
   * Continues the failed run instead of buying it again.
   *
   * Deliberately not `run()` with a flag: `run()` starts a new run from the
   * current form, which is the wrong thing entirely for a run that already has
   * an outline, a draft and an audit stored against its own id. This keeps the
   * same run id, so the poller and every link the operator has stay valid.
   */
  const resume = useCallback(() => {
    if (!pipelineRunId) return
    resetTerminalHandled()
    resetStatusError()
    clearLifecycleState()
    setLoadingLabel('Resuming the run...')

    void resumePrompt2BlogRun(pipelineRunId)
      .then(plan => {
        appendPipelineLog(
          `Resuming run ${pipelineRunId} from ${plan.resume_from_stage}. `
          + 'Everything before it is kept.',
        )
        setLoadingLabel('Running final article pipeline...')
        setSourceStep('pipeline_running')
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to resume the run'
        setError(message)
        appendPipelineLog(`Resume failed: ${message}`, 'error')
        setLoadingLabel('')
        // The run is still failed and still the operator's to act on, so the
        // panel keeps showing why rather than losing the state it just cleared.
        setResumePlan(null)
      })
  }, [
    appendPipelineLog,
    clearLifecycleState,
    pipelineRunId,
    resetStatusError,
    resetTerminalHandled,
    setError,
    setLoadingLabel,
    setResumePlan,
    setSourceStep,
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
    setNeedsResearch(null)
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
  // A `needs_research` answer returns sourceStep to 'edit', which is correct:
  // nothing was queued, so the stage list goes back to reporting nothing.
  const hasStartedRun = sourceStep !== 'edit' || isStartingPipeline

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
    hasStartedRun,
    loadingLabel,
    error,
    setError,
    stageArticleUrl,
    canOpenCleanupModal,
    needsResearch,
    dismissNeedsResearch: () => setNeedsResearch(null),
    pipelineVersion,
    resumePlan,
    run,
    resume,
    reset,
  }
}
