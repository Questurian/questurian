import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  fetchLatestStatus,
  fetchStatus,
  runUrl2BlogPipelineV2,
} from '../api'
import { usePipelineRunPoll } from '../../pipelineRuns/hooks/usePipelineRunPoll'
import {
  NARRATIVE_FOCUS_PRESETS,
  URL2BLOG_PROGRESS_STEPS,
  URL2BLOG_TEXT_PROGRESS_STEPS,
} from '../constants/pipeline-ui.constants'
import type {
  Url2BlogExecutionProfile,
  Url2BlogInputMode,
  Url2BlogModel,
  Url2BlogPipelineV2Response,
  Url2BlogStatusResponse,
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
  const [includeDebug, setIncludeDebug] = useState(true)
  const [modelName, setModelName] = useState<Url2BlogModel>('gemini-2.5-flash')
  const [executionProfile, setExecutionProfile] = useState<Url2BlogExecutionProfile>('standard')
  const [runSubmittedAt, setRunSubmittedAt] = useState<number | null>(null)
  const [result, setResult] = useState<Url2BlogPipelineV2Response | null>(null)

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
        model_name: modelName,
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
    setIncludeDebug(true)
    setModelName('gemini-2.5-flash')
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
      includeDebug, setIncludeDebug,
      modelName, setModelName,
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
      pipelineMutation,
      currentStep,
      result,
      handleStartOver,
    },
  }
}
