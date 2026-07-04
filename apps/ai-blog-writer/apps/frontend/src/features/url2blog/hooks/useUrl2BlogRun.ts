import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchArticleTypes,
  fetchLatestStatus,
  fetchRunDebug,
  fetchStatus,
  fetchToneProfiles,
  runUrl2BlogPipelineV2,
} from '../api'
import { usePipelineRunPoll } from '../../pipelineRuns/hooks/usePipelineRunPoll'
import {
  DEFAULT_ARTICLE_TONE_ID,
  type ArticleToneId,
} from '../../../shared/api/ai/models'
import {
  NARRATIVE_FOCUS_PRESETS,
  URL2BLOG_DEFAULT_WRITER_MODEL,
  URL2BLOG_PROGRESS_STEPS,
  URL2BLOG_TEXT_PROGRESS_STEPS,
} from '../constants/pipeline-ui.constants'
import type {
  Url2BlogExecutionProfile,
  Url2BlogInputMode,
  Url2BlogModel,
  Url2BlogPipelineV2Response,
  Url2BlogStatusResponse,
  Url2BlogWriterModel,
} from '../types/pipeline.types'
import { normalizeArticleUrlInput } from '../urlInput'
import { getProgressItemState, getStageLabel } from '../utils/pipeline-progress.utils'

export type WizardStep = 'input' | 'processing' | 'complete'

function createRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `url2blog-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function useUrl2BlogRun() {
  const [inputMode, setInputMode] = useState<Url2BlogInputMode>('url')
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [selectedNarrativeFocusPresetId, setSelectedNarrativeFocusPresetId] = useState('')
  const [customNarrativeFocus, setCustomNarrativeFocus] = useState('')
  const [toneId, setToneId] = useState<ArticleToneId>(DEFAULT_ARTICLE_TONE_ID)
  const [includeDebug, setIncludeDebug] = useState(true)
  const [modelName, setModelName] = useState<Url2BlogModel>('gemini-2.5-flash-lite')
  const [writingModel, setWritingModel] = useState<Url2BlogWriterModel>(
    URL2BLOG_DEFAULT_WRITER_MODEL
  )
  const [executionProfile, setExecutionProfile] = useState<Url2BlogExecutionProfile>('standard')
  const [runSubmittedAt, setRunSubmittedAt] = useState<number | null>(null)
  const [result, setResult] = useState<Url2BlogPipelineV2Response | null>(null)

  const articleTypesQuery = useQuery({
    queryKey: ['url2blog-article-types'],
    queryFn: fetchArticleTypes,
    staleTime: 5 * 60 * 1000,
  })

  const toneProfilesQuery = useQuery({
    queryKey: ['url2blog-tone-profiles'],
    queryFn: fetchToneProfiles,
    staleTime: 5 * 60 * 1000,
  })

  const selectedNarrativeFocusPreset = useMemo(
    () => NARRATIVE_FOCUS_PRESETS.find((preset) => preset.id === selectedNarrativeFocusPresetId) ?? null,
    [selectedNarrativeFocusPresetId]
  )
  const narrativeFocus = useMemo(() => {
    const parts = selectedNarrativeFocusPreset ? [selectedNarrativeFocusPreset.prompt] : []
    const customFocus = customNarrativeFocus.trim()
    if (customFocus) parts.push(customFocus)
    return parts.join('\n\n')
  }, [customNarrativeFocus, selectedNarrativeFocusPreset])

  const pipelineMutation = useMutation<
    Url2BlogPipelineV2Response,
    Error,
    { runId: string; url?: string; pastedText?: string }
  >({
    mutationFn: ({ runId, url: normalizedUrl, pastedText: text }) =>
      runUrl2BlogPipelineV2({
        run_id: runId,
        ...(normalizedUrl ? { url: normalizedUrl } : {}),
        ...(text ? { pasted_text: text } : {}),
        include_debug: includeDebug,
        narrative_focus: narrativeFocus.trim() || undefined,
        tone_id: toneId,
        model_name: modelName,
        writing_model: writingModel,
        execution_profile: executionProfile,
      }),
    onSuccess: (data) => {
      if (data.run_id) setActiveRunId(data.run_id)
      setResult(data)
    },
  })

  const statusQuery = usePipelineRunPoll<Url2BlogStatusResponse>({
    queryKey: ['url2blog-status', activeRunId],
    runId: activeRunId,
    fetchStatus: async (runId) => {
      const now = Date.now()
      const allowNotFoundBootstrap =
        pipelineMutation.isPending && runSubmittedAt !== null && now - runSubmittedAt < 12_000
      try {
        return await fetchStatus(runId, { allowNotFound: allowNotFoundBootstrap }) ?? {
          run_id: runId,
          state: 'pending',
          stage: 'stage_1',
          updated_at: '',
          error: null,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const shouldTryLatest =
          pipelineMutation.isPending && message.includes('Run not found for') && !allowNotFoundBootstrap
        if (!shouldTryLatest) throw error
        const latest = await fetchLatestStatus()
        if (!latest?.run_id) throw error
        const updatedAtMs = Date.parse(latest.updated_at)
        if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > 120_000) throw error
        if (!['running', 'completed', 'failed'].includes(latest.state)) throw error
        return latest
      }
    },
    enabled: Boolean(activeRunId),
    pollIntervalMs: 1000,
    shouldContinuePolling: () => pipelineMutation.isPending,
  })

  const activeStatus = statusQuery.data ?? null
  useEffect(() => {
    if (!activeStatus?.run_id || !activeRunId || activeStatus.run_id === activeRunId) return
    setActiveRunId(activeStatus.run_id)
  }, [activeRunId, activeStatus?.run_id])

  const activeStage = typeof activeStatus?.stage === 'string' ? activeStatus.stage : null
  const processingSteps = useMemo(
    () => (inputMode === 'text' ? URL2BLOG_TEXT_PROGRESS_STEPS : URL2BLOG_PROGRESS_STEPS)
      .map((step) => ({ ...step, state: getProgressItemState(step, activeStatus) })),
    [activeStatus, inputMode]
  )
  const statusErrorMessage =
    activeStatus?.state === 'failed' && activeStatus.error ? activeStatus.error : null
  const mutationErrorMessage =
    pipelineMutation.error instanceof Error ? pipelineMutation.error.message : null

  const runFailed = pipelineMutation.isError || activeStatus?.state === 'failed'
  const failedRunDebugQuery = useQuery({
    queryKey: ['url2blog-failed-run-debug', activeRunId],
    queryFn: () => fetchRunDebug(activeRunId as string),
    enabled: Boolean(activeRunId) && runFailed,
    retry: 1,
    staleTime: Infinity,
  })
  const failedRunDebug = runFailed ? failedRunDebugQuery.data ?? null : null
  const currentStep: WizardStep = pipelineMutation.isPending ? 'processing' : result ? 'complete' : 'input'

  const resetRunOutput = () => {
    setResult(null)
    pipelineMutation.reset()
  }
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const runId = createRunId()
    if (inputMode === 'text') {
      const trimmedText = pastedText.trim()
      if (!trimmedText) {
        setInputError('Paste some article text to continue.')
        return
      }
      setInputError(null)
      setActiveRunId(runId)
      setRunSubmittedAt(Date.now())
      resetRunOutput()
      pipelineMutation.mutate({ runId, pastedText: trimmedText })
      return
    }

    const normalizedUrl = normalizeArticleUrlInput(url)
    if (!normalizedUrl) {
      setInputError('Enter a valid article URL. Bare domains are fine; we will add https:// for you.')
      return
    }
    setInputError(null)
    setUrl(normalizedUrl)
    setActiveRunId(runId)
    setRunSubmittedAt(Date.now())
    resetRunOutput()
    pipelineMutation.mutate({ runId, url: normalizedUrl })
  }

  const handleStartOver = () => {
    setUrl('')
    setPastedText('')
    setActiveRunId(null)
    setRunSubmittedAt(null)
    setSelectedNarrativeFocusPresetId('')
    setCustomNarrativeFocus('')
    setToneId(DEFAULT_ARTICLE_TONE_ID)
    setIncludeDebug(true)
    setModelName('gemini-2.5-flash-lite')
    setExecutionProfile('standard')
    resetRunOutput()
  }

  return {
    input: {
      inputMode, setInputMode,
      url, setUrl,
      pastedText, setPastedText,
      inputError, setInputError,
      handleSubmit,
    },
    config: {
      selectedNarrativeFocusPresetId, setSelectedNarrativeFocusPresetId,
      customNarrativeFocus, setCustomNarrativeFocus,
      narrativeFocus,
      toneId, setToneId,
      toneProfiles: toneProfilesQuery.data ?? [],
      articleTypes: articleTypesQuery.data ?? [],
      includeDebug, setIncludeDebug,
      modelName, setModelName,
      writingModel, setWritingModel,
      executionProfile, setExecutionProfile,
    },
    pipeline: {
      activeRunId,
      activeStatus,
      liveStageLabel: getStageLabel(activeStage),
      processingSteps,
      statusQuery,
      statusErrorMessage,
      mutationErrorMessage,
      failedRunDebug,
      pipelineMutation,
      currentStep,
      result,
      handleStartOver,
    },
  }
}
