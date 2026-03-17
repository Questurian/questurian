import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../assets/payload-logo.svg?url'
import {
  getPrompt2BlogDebug,
  getPrompt2BlogGuidelinePreview,
  getPrompt2BlogInputOptions,
  getPrompt2BlogResult,
  getPrompt2BlogStatus,
  startPrompt2BlogRun,
  type Prompt2BlogGuidelinePreviewResponse,
  type Prompt2BlogInputOption,
  type Prompt2BlogInputOptionsResponse,
  type Prompt2BlogModelName,
  type Prompt2BlogPipelinePayload,
  type Prompt2BlogStatusResponse,
} from './api'
import {
  DEFAULT_PROMPT2BLOG_MODEL,
  PROMPT2BLOG_MODEL_OPTIONS,
  resolvePrompt2BlogModelName,
} from './constants/prompt2blog.constants'
import './styles.css'

interface RawBlob {
  id: number
  content: string
}

interface P2BFormState {
  articleTypeId: number | null
  articleGoal: string
  targetReader: string
  destinationContext: string
  modelName: Prompt2BlogModelName
  toneId: string
  lengthId: string
  brandVoiceId: string
  primaryKeyword: string
  secondaryKeywords: string
  mustInclude: string
  audienceProfile: string
  creativityLevel: 'low' | 'medium' | 'high'
  negativeInstructions: string
  promptEnhance: boolean
  enableEditorialAugmentation: boolean
  blobs: RawBlob[]
}

const STORAGE_KEY = 'p2b-form-draft'
const RUN_STORAGE_KEY = 'p2b-run-state'

const DEFAULT_STATE: P2BFormState = {
  articleTypeId: null,
  articleGoal: '',
  targetReader: '',
  destinationContext: '',
  modelName: DEFAULT_PROMPT2BLOG_MODEL,
  toneId: '',
  lengthId: '',
  brandVoiceId: '',
  primaryKeyword: '',
  secondaryKeywords: '',
  mustInclude: '',
  audienceProfile: '',
  creativityLevel: 'medium',
  negativeInstructions: '',
  promptEnhance: true,
  enableEditorialAugmentation: true,
  blobs: [{ id: 1, content: '' }],
}

function loadSavedState(): P2BFormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<P2BFormState>
    return {
      ...DEFAULT_STATE,
      ...parsed,
      modelName: resolvePrompt2BlogModelName(parsed.modelName),
      blobs: Array.isArray(parsed.blobs) && parsed.blobs.length ? parsed.blobs : DEFAULT_STATE.blobs,
      creativityLevel:
        parsed.creativityLevel === 'low' || parsed.creativityLevel === 'high'
          ? parsed.creativityLevel
          : 'medium',
    }
  } catch {
    return DEFAULT_STATE
  }
}

type SourceStep = 'edit' | 'pipeline_running' | 'pipeline_complete'

interface PersistedRunState {
  sourceStep: SourceStep
  pipelineRunId: string | null
  pipelineResult: Prompt2BlogPipelinePayload | null
}

function loadSavedRunState(): PersistedRunState {
  const fallback: PersistedRunState = {
    sourceStep: 'edit',
    pipelineRunId: null,
    pipelineResult: null,
  }

  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<PersistedRunState>
    const sourceStep =
      parsed.sourceStep === 'pipeline_running' || parsed.sourceStep === 'pipeline_complete'
        ? parsed.sourceStep
        : 'edit'

    return {
      sourceStep,
      pipelineRunId: typeof parsed.pipelineRunId === 'string' ? parsed.pipelineRunId : null,
      pipelineResult:
        parsed.pipelineResult && typeof parsed.pipelineResult === 'object'
        && (parsed.pipelineResult as { quality_review?: unknown }).quality_review
          ? (parsed.pipelineResult as Prompt2BlogPipelinePayload)
          : null,
    }
  } catch {
    return fallback
  }
}

type PipelineStepStatus = 'pending' | 'running' | 'done' | 'error'
type PipelineLogLevel = 'info' | 'error'

type PipelineLogEntry = {
  id: number
  at: string
  level: PipelineLogLevel
  message: string
}

const PIPELINE_STAGE_ORDER = [
  'queued',
  'stage_input_validate',
  'stage_input_cleanup',
  'stage_synthesize_sources',
  'stage_guideline_fetch',
  'stage_coverage_check',
  'stage_supplement',
  'stage_compose',
  'stage_quality_audit',
  'stage_repair',
  'stage_editorial_augmentation',
  'stage_title',
  'stage_finalize',
  'complete',
] as const

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  stage_input_validate: 'Validate inputs',
  stage_input_cleanup: 'Clean source material',
  stage_synthesize_sources: 'Synthesize source material',
  stage_guideline_fetch: 'Fetch article guidelines',
  stage_coverage_check: 'Check coverage against brief + guideline',
  stage_supplement: 'Generate supplemental sections (if needed)',
  stage_compose: 'Compose full draft',
  stage_quality_audit: 'Audit draft quality and constraints',
  stage_repair: 'Repair pass (if needed)',
  stage_editorial_augmentation: 'Apply editorial blocks (if helpful)',
  stage_title: 'Generate final title',
  stage_finalize: 'Finalize markdown output',
  complete: 'Complete',
}

function getPipelineStepStatus(
  step: string,
  status: Prompt2BlogStatusResponse | null,
): PipelineStepStatus {
  if (!status) {
    return step === 'queued' ? 'running' : 'pending'
  }

  const activeIndex = PIPELINE_STAGE_ORDER.indexOf(
    (status.stage || 'queued') as (typeof PIPELINE_STAGE_ORDER)[number],
  )
  const stepIndex = PIPELINE_STAGE_ORDER.indexOf(step as (typeof PIPELINE_STAGE_ORDER)[number])

  if (status.state === 'failed') {
    if (step === status.stage) return 'error'
    return stepIndex < activeIndex ? 'done' : 'pending'
  }
  if (status.state === 'completed') {
    return step === 'complete' || stepIndex <= activeIndex ? 'done' : 'pending'
  }
  if (step === status.stage) return 'running'
  return stepIndex < activeIndex ? 'done' : 'pending'
}

function splitCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function splitLineSeparated(value: string): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

function findDefaultOption(options: Prompt2BlogInputOption[]): string {
  const preferred = options.find(option => option.default)
  if (preferred?.id) return preferred.id
  return options[0]?.id || ''
}

export default function Prompt2BlogPage() {
  const saved = useRef(loadSavedState())
  const savedRun = useRef(loadSavedRunState())

  const [articleTypeId, setArticleTypeId] = useState<number | null>(saved.current.articleTypeId)
  const [articleGoal, setArticleGoal] = useState(saved.current.articleGoal)
  const [targetReader, setTargetReader] = useState(saved.current.targetReader)
  const [destinationContext, setDestinationContext] = useState(saved.current.destinationContext)
  const [modelName, setModelName] = useState<Prompt2BlogModelName>(saved.current.modelName)
  const [toneId, setToneId] = useState(saved.current.toneId)
  const [lengthId, setLengthId] = useState(saved.current.lengthId)
  const [brandVoiceId, setBrandVoiceId] = useState(saved.current.brandVoiceId)
  const [primaryKeyword, setPrimaryKeyword] = useState(saved.current.primaryKeyword)
  const [secondaryKeywords, setSecondaryKeywords] = useState(saved.current.secondaryKeywords)
  const [mustInclude, setMustInclude] = useState(saved.current.mustInclude)
  const [audienceProfile, setAudienceProfile] = useState(saved.current.audienceProfile)
  const [creativityLevel, setCreativityLevel] = useState<'low' | 'medium' | 'high'>(
    saved.current.creativityLevel,
  )
  const [negativeInstructions, setNegativeInstructions] = useState(saved.current.negativeInstructions)
  const [promptEnhance, setPromptEnhance] = useState(saved.current.promptEnhance)
  const [enableEditorialAugmentation, setEnableEditorialAugmentation] = useState(
    saved.current.enableEditorialAugmentation,
  )
  const [blobs, setBlobs] = useState<RawBlob[]>(saved.current.blobs)

  const [inputOptions, setInputOptions] = useState<Prompt2BlogInputOptionsResponse | null>(null)
  const [guidelinePreview, setGuidelinePreview] =
    useState<Prompt2BlogGuidelinePreviewResponse | null>(null)
  const [guidelineLoading, setGuidelineLoading] = useState(false)

  useEffect(() => {
    const state: P2BFormState = {
      articleTypeId,
      articleGoal,
      targetReader,
      destinationContext,
      modelName,
      toneId,
      lengthId,
      brandVoiceId,
      primaryKeyword,
      secondaryKeywords,
      mustInclude,
      audienceProfile,
      creativityLevel,
      negativeInstructions,
      promptEnhance,
      enableEditorialAugmentation,
      blobs,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [
    articleTypeId,
    articleGoal,
    targetReader,
    destinationContext,
    modelName,
    toneId,
    lengthId,
    brandVoiceId,
    primaryKeyword,
    secondaryKeywords,
    mustInclude,
    audienceProfile,
    creativityLevel,
    negativeInstructions,
    promptEnhance,
    enableEditorialAugmentation,
    blobs,
  ])

  useEffect(() => {
    let cancelled = false
    getPrompt2BlogInputOptions()
      .then((options) => {
        if (cancelled) return
        setInputOptions(options)
        if (!toneId) {
          setToneId(options.defaults.tone_id || findDefaultOption(options.tones))
        }
        if (!lengthId) {
          setLengthId(options.defaults.length_id || findDefaultOption(options.lengths))
        }
        if (!brandVoiceId) {
          setBrandVoiceId(options.defaults.brand_voice_id || findDefaultOption(options.brand_voices))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInputOptions({
            article_types: [],
            tones: [],
            lengths: [],
            brand_voices: [],
            defaults: {
              tone_id: '',
              length_id: '',
              brand_voice_id: '',
            },
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [brandVoiceId, lengthId, toneId])

  useEffect(() => {
    if (!articleTypeId) {
      setGuidelinePreview(null)
      return
    }

    let cancelled = false
    setGuidelineLoading(true)
    getPrompt2BlogGuidelinePreview(articleTypeId)
      .then((payload) => {
        if (!cancelled) {
          setGuidelinePreview(payload)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGuidelinePreview(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGuidelineLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [articleTypeId])

  const addBlob = () => {
    setBlobs(prev => [...prev, { id: Date.now(), content: '' }])
  }

  const removeBlob = (id: number) => {
    if (blobs.length <= 1) return
    setBlobs(prev => prev.filter(b => b.id !== id))
  }

  const updateBlob = (id: number, content: string) => {
    setBlobs(prev => prev.map(b => b.id === id ? { ...b, content } : b))
  }

  const [sourceStep, setSourceStep] = useState<SourceStep>(savedRun.current.sourceStep)
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(savedRun.current.pipelineRunId)
  const [pipelineStatus, setPipelineStatus] = useState<Prompt2BlogStatusResponse | null>(null)
  const [pipelineResult, setPipelineResult] = useState<Prompt2BlogPipelinePayload | null>(
    savedRun.current.pipelineResult,
  )
  const [pipelineDebugData, setPipelineDebugData] = useState<Record<string, unknown> | null>(null)
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLogEntry[]>([])
  const [showPipelineDebug, setShowPipelineDebug] = useState(false)
  const lastObservedStageRef = useRef<string | null>(null)
  const resumedRunLoggedRef = useRef(false)

  const [isLoading, setIsLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const buildPayload = useMemo(() => {
    const sourceMaterial = blobs
      .map(blob => blob.content.trim())
      .filter(Boolean)

    return {
      article_type_id: articleTypeId || 0,
      source_material: sourceMaterial,
      article_goal: articleGoal,
      target_reader: targetReader,
      destination_context: destinationContext,
      model_name: modelName,
      tone_id: toneId,
      length_id: lengthId,
      brand_voice_id: brandVoiceId || undefined,
      primary_keyword: primaryKeyword || undefined,
      secondary_keywords: splitCommaSeparated(secondaryKeywords),
      must_include: splitLineSeparated(mustInclude),
      audience_profile: audienceProfile || undefined,
      prompt_enhance: promptEnhance,
      creativity_level: creativityLevel,
      negative_instructions: splitLineSeparated(negativeInstructions),
      include_debug: true,
      enable_editorial_augmentation: enableEditorialAugmentation,
    }
  }, [
    articleTypeId,
    blobs,
    articleGoal,
    targetReader,
    destinationContext,
    modelName,
    toneId,
    lengthId,
    brandVoiceId,
    primaryKeyword,
    secondaryKeywords,
    mustInclude,
    audienceProfile,
    promptEnhance,
    creativityLevel,
    negativeInstructions,
    enableEditorialAugmentation,
  ])

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

  const handleCopyJson = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(buildPayload, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setError('Unable to copy JSON to clipboard.')
    })
  }, [buildPayload])

  const handleRunPipeline = useCallback(async () => {
    if (!buildPayload.article_type_id) {
      setError('Article type is required.')
      return
    }
    if (!buildPayload.source_material.length) {
      setError('At least one source material entry is required.')
      return
    }
    if (!buildPayload.article_goal.trim() || !buildPayload.target_reader.trim() || !buildPayload.destination_context.trim()) {
      setError('Article goal, target reader, and destination context are required.')
      return
    }
    if (!buildPayload.tone_id || !buildPayload.length_id) {
      setError('Tone and length are required.')
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

    try {
      const startResponse = await startPrompt2BlogRun(buildPayload)
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
  }, [appendPipelineLog, buildPayload])

  const handleResetRun = useCallback(() => {
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
    localStorage.removeItem(RUN_STORAGE_KEY)
  }, [])

  const handleClear = useCallback(() => {
    setArticleTypeId(DEFAULT_STATE.articleTypeId)
    setArticleGoal(DEFAULT_STATE.articleGoal)
    setTargetReader(DEFAULT_STATE.targetReader)
    setDestinationContext(DEFAULT_STATE.destinationContext)
    setModelName(DEFAULT_STATE.modelName)
    setToneId(DEFAULT_STATE.toneId)
    setLengthId(DEFAULT_STATE.lengthId)
    setBrandVoiceId(DEFAULT_STATE.brandVoiceId)
    setPrimaryKeyword(DEFAULT_STATE.primaryKeyword)
    setSecondaryKeywords(DEFAULT_STATE.secondaryKeywords)
    setMustInclude(DEFAULT_STATE.mustInclude)
    setAudienceProfile(DEFAULT_STATE.audienceProfile)
    setCreativityLevel(DEFAULT_STATE.creativityLevel)
    setNegativeInstructions(DEFAULT_STATE.negativeInstructions)
    setPromptEnhance(DEFAULT_STATE.promptEnhance)
    setEnableEditorialAugmentation(DEFAULT_STATE.enableEditorialAugmentation)
    setBlobs(DEFAULT_STATE.blobs)
    localStorage.removeItem(STORAGE_KEY)
    handleResetRun()
  }, [handleResetRun])

  useEffect(() => {
    const payload: PersistedRunState = {
      sourceStep,
      pipelineRunId,
      pipelineResult,
    }
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(payload))
  }, [sourceStep, pipelineRunId, pipelineResult])

  useEffect(() => {
    if (!pipelineRunId || sourceStep !== 'pipeline_running') return

    let cancelled = false
    let timeoutId: number | null = null

    const poll = async () => {
      try {
        const status = await getPrompt2BlogStatus(pipelineRunId)
        if (cancelled) return

        setPipelineStatus(status)

        if (status.stage && lastObservedStageRef.current !== status.stage) {
          lastObservedStageRef.current = status.stage
          const stageLabel = PIPELINE_STAGE_LABELS[status.stage] || status.stage
          appendPipelineLog(`Stage: ${stageLabel}`)
          setLoadingLabel(`Running: ${stageLabel}`)
        }

        if (status.state === 'completed') {
          const result = await getPrompt2BlogResult(pipelineRunId)
          if (cancelled) return
          if (result.artifact?.pipeline_v2) {
            setPipelineResult(result.artifact.pipeline_v2)
            const traceUrl = result.artifact.pipeline_v2.langsmith_trace_url || result.langsmith_trace_url
            if (traceUrl) {
              appendPipelineLog(`LangSmith trace available: ${traceUrl}`)
            }
          } else {
            setError('Pipeline finished but no final payload was returned.')
          }

          const debugPayload = await getPrompt2BlogDebug(pipelineRunId).catch(() => null)
          if (debugPayload?.stages) {
            setPipelineDebugData(debugPayload.stages)
          }

          appendPipelineLog('Pipeline completed successfully.')
          setSourceStep('pipeline_complete')
          setIsLoading(false)
          setLoadingLabel('')
          return
        }

        if (status.state === 'failed') {
          const failureMessage = status.error || 'Pipeline failed.'
          appendPipelineLog(
            `Pipeline failed at ${PIPELINE_STAGE_LABELS[status.stage] || status.stage}: ${failureMessage}`,
            'error',
          )
          setError(failureMessage)

          const debugPayload = await getPrompt2BlogDebug(pipelineRunId).catch(() => null)
          if (debugPayload?.stages) {
            setPipelineDebugData(debugPayload.stages)
          }

          setSourceStep('edit')
          setIsLoading(false)
          setLoadingLabel('')
          return
        }

        timeoutId = window.setTimeout(poll, 1200)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to poll pipeline status'
        appendPipelineLog(`Status polling error: ${message}`, 'error')
        timeoutId = window.setTimeout(poll, 2000)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [appendPipelineLog, pipelineRunId, sourceStep])

  useEffect(() => {
    if (sourceStep === 'pipeline_running' && !pipelineRunId) {
      setSourceStep('edit')
    }
  }, [pipelineRunId, sourceStep])

  useEffect(() => {
    if (sourceStep === 'pipeline_complete' && !pipelineResult) {
      setSourceStep('edit')
    }
  }, [pipelineResult, sourceStep])

  useEffect(() => {
    if (sourceStep !== 'pipeline_running' || !pipelineRunId) return
    setIsLoading(true)
    if (!loadingLabel) {
      setLoadingLabel('Running final article pipeline...')
    }
    if (!resumedRunLoggedRef.current) {
      appendPipelineLog(`Resumed run: ${pipelineRunId}`)
      resumedRunLoggedRef.current = true
    }
  }, [appendPipelineLog, loadingLabel, pipelineRunId, sourceStep])

  return (
    <div className="p2b-page">
      <header className="p2b-hero">
        <div>
          <p className="p2b-eyebrow">Questurian Studio</p>
          <h1>
            Craft articles from <span className="p2b-underline-text">structured input</span>
            <span className="p2b-dot">.</span>
          </h1>
          <p className="p2b-lede">
            Choose article type, set voice controls, paste source material, and run the full guideline-aware pipeline.
          </p>
        </div>
        <div className="p2b-badge-row">
          <Link to="/" className="p2b-nav-link">&larr; Home</Link>
          <Link to="/prompt2blog/articles" className="p2b-nav-link">Saved Articles</Link>
          <Link to="/prompt2blog/stage" className="p2b-nav-link">
            Staged ({(() => {
              try {
                const stored = localStorage.getItem('prompt2blog_staged_articles_v2')
                return stored ? JSON.parse(stored).length : 0
              } catch {
                return 0
              }
            })()})
          </Link>
        </div>
      </header>

      <main className="p2b-form-container">
        <form className="p2b-form" onSubmit={(event) => event.preventDefault()}>
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Core Inputs</h2>
              <p>Select article type and provide intent/context.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-article-type">Article Type</label>
                <select
                  id="p2b-article-type"
                  className="p2b-select"
                  value={articleTypeId ?? ''}
                  onChange={(event) => setArticleTypeId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Select article type</option>
                  {(inputOptions?.article_types || []).map(option => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p2b-field">
                <label htmlFor="p2b-goal">Article Goal</label>
                <textarea
                  id="p2b-goal"
                  className="p2b-textarea"
                  rows={2}
                  value={articleGoal}
                  onChange={(event) => setArticleGoal(event.target.value)}
                  placeholder="What this article should help the reader accomplish"
                />
              </div>

              <div className="p2b-field-row p2b-field-row--2">
                <div className="p2b-field">
                  <label htmlFor="p2b-target-reader">Target Reader</label>
                  <input
                    id="p2b-target-reader"
                    type="text"
                    className="p2b-input"
                    value={targetReader}
                    onChange={(event) => setTargetReader(event.target.value)}
                    placeholder="Who this is written for"
                  />
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-destination">Destination Context</label>
                  <input
                    id="p2b-destination"
                    type="text"
                    className="p2b-input"
                    value={destinationContext}
                    onChange={(event) => setDestinationContext(event.target.value)}
                    placeholder="City / region / country context"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Prompt Profiles</h2>
              <p>These dropdowns are loaded from markdown option catalogs.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field-row p2b-field-row--3">
                <div className="p2b-field">
                  <label htmlFor="p2b-tone">Tone</label>
                  <select
                    id="p2b-tone"
                    className="p2b-select"
                    value={toneId}
                    onChange={(event) => setToneId(event.target.value)}
                  >
                    {(inputOptions?.tones || []).map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-length">Length</label>
                  <select
                    id="p2b-length"
                    className="p2b-select"
                    value={lengthId}
                    onChange={(event) => setLengthId(event.target.value)}
                  >
                    {(inputOptions?.lengths || []).map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-brand-voice">Brand Voice</label>
                  <select
                    id="p2b-brand-voice"
                    className="p2b-select"
                    value={brandVoiceId}
                    onChange={(event) => setBrandVoiceId(event.target.value)}
                  >
                    {(inputOptions?.brand_voices || []).map(option => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p2b-field-row p2b-field-row--3">
                <div className="p2b-field">
                  <label htmlFor="p2b-model">Writing Model</label>
                  <select
                    id="p2b-model"
                    className="p2b-select"
                    value={modelName}
                    onChange={(event) => setModelName(resolvePrompt2BlogModelName(event.target.value))}
                  >
                    {PROMPT2BLOG_MODEL_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-creativity">Creativity Level</label>
                  <select
                    id="p2b-creativity"
                    className="p2b-select"
                    value={creativityLevel}
                    onChange={(event) => setCreativityLevel(event.target.value as 'low' | 'medium' | 'high')}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-audience-profile">Audience Profile (Optional)</label>
                  <input
                    id="p2b-audience-profile"
                    type="text"
                    className="p2b-input"
                    value={audienceProfile}
                    onChange={(event) => setAudienceProfile(event.target.value)}
                    placeholder="Extra reader detail"
                  />
                </div>
              </div>

              <div className="p2b-field">
                <label htmlFor="p2b-negative">Negative Instructions (one per line)</label>
                <textarea
                  id="p2b-negative"
                  className="p2b-textarea"
                  rows={3}
                  value={negativeInstructions}
                  onChange={(event) => setNegativeInstructions(event.target.value)}
                  placeholder="What to avoid"
                />
              </div>

              <label className="p2b-debug-checkbox" htmlFor="p2b-prompt-enhance">
                <input
                  id="p2b-prompt-enhance"
                  type="checkbox"
                  checked={promptEnhance}
                  onChange={(event) => setPromptEnhance(event.target.checked)}
                />
                Prompt Enhance
              </label>

              <label className="p2b-debug-checkbox" htmlFor="p2b-editorial-toggle">
                <input
                  id="p2b-editorial-toggle"
                  type="checkbox"
                  checked={enableEditorialAugmentation}
                  onChange={(event) => setEnableEditorialAugmentation(event.target.checked)}
                />
                Enable editorial augmentation
              </label>
            </div>
          </section>

          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>SEO + Constraints</h2>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field-row p2b-field-row--2">
                <div className="p2b-field">
                  <label htmlFor="p2b-primary-kw">Primary Keyword</label>
                  <input
                    id="p2b-primary-kw"
                    type="text"
                    className="p2b-input"
                    value={primaryKeyword}
                    onChange={(event) => setPrimaryKeyword(event.target.value)}
                  />
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-secondary-kws">Secondary Keywords (comma-separated)</label>
                  <input
                    id="p2b-secondary-kws"
                    type="text"
                    className="p2b-input"
                    value={secondaryKeywords}
                    onChange={(event) => setSecondaryKeywords(event.target.value)}
                  />
                </div>
              </div>

              <div className="p2b-field">
                <label htmlFor="p2b-must-include">Must Include (one per line)</label>
                <textarea
                  id="p2b-must-include"
                  className="p2b-textarea"
                  rows={3}
                  value={mustInclude}
                  onChange={(event) => setMustInclude(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Source Material</h2>
              <p>Paste source text blocks. Messy copy-paste is cleaned in pipeline.</p>
            </div>
            <div className="p2b-panel-body">
              {blobs.map((blob, index) => (
                <div key={blob.id} className="p2b-source-block">
                  <label htmlFor={`p2b-blob-${blob.id}`}>Source Block {index + 1}</label>
                  <textarea
                    id={`p2b-blob-${blob.id}`}
                    className="p2b-textarea"
                    rows={6}
                    value={blob.content}
                    onChange={(event) => updateBlob(blob.id, event.target.value)}
                    placeholder="Paste raw text, copied article sections, notes, etc."
                  />
                  <div className="p2b-button-row">
                    <button type="button" className="p2b-clear-btn" onClick={() => removeBlob(blob.id)}>
                      Remove Block
                    </button>
                  </div>
                </div>
              ))}

              <div className="p2b-button-row">
                <button type="button" className="p2b-rerun-btn" onClick={addBlob}>Add Source Block</button>
              </div>
            </div>
          </section>

          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Guideline Preview</h2>
              <p>Loaded from selected article type guideline markdown.</p>
            </div>
            <div className="p2b-panel-body">
              {guidelineLoading && <p>Loading guideline preview...</p>}
              {!guidelineLoading && !guidelinePreview && (
                <p className="p2b-guideline-hint">Select an article type to view guideline details.</p>
              )}
              {guidelinePreview && (
                <>
                  <p>
                    <strong>{guidelinePreview.name}</strong>
                    {guidelinePreview.guideline_file ? ` (${guidelinePreview.guideline_file})` : ''}
                  </p>
                  <div className="p2b-raw-json">
                    <pre>{guidelinePreview.guideline}</pre>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Pipeline</h2>
              <p>Run status and logs.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-button-row">
                <button type="button" className="p2b-synthesize-btn" onClick={handleRunPipeline}>
                  Run Prompt2Blog Pipeline
                </button>
                <button type="button" className="p2b-rerun-btn" onClick={handleResetRun}>Reset Run</button>
              </div>

              <div className="p2b-progress-grid">
                {PIPELINE_STAGE_ORDER.map((step) => {
                  const status = getPipelineStepStatus(step, pipelineStatus)
                  return (
                    <div key={step} className={`p2b-progress-item p2b-progress-item--${status}`}>
                      <strong>{PIPELINE_STAGE_LABELS[step] || step}</strong>
                      <span>{status}</span>
                    </div>
                  )
                })}
              </div>

              {pipelineLogs.length > 0 && (
                <div className="p2b-raw-json">
                  <pre>{pipelineLogs.map(log => `[${log.at}] ${log.level.toUpperCase()}: ${log.message}`).join('\n')}</pre>
                </div>
              )}

              {sourceStep === 'pipeline_complete' && pipelineResult && (
                <div className="p2b-final-result">
                  <h3>Final Article Ready</h3>
                  <div className="p2b-panel-actions" style={{ marginBottom: '1rem' }}>
                    {stageArticleUrl && (
                      <Link to={stageArticleUrl} className="p2b-synthesize-btn payload-action-btn">
                        <img
                          src={payloadLogoUrl}
                          alt=""
                          aria-hidden="true"
                          className="payload-action-btn-icon"
                        />
                        Stage in Payload Editor
                      </Link>
                    )}
                    {pipelineResult.langsmith_trace_url && (
                      <a
                        href={pipelineResult.langsmith_trace_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p2b-synthesize-btn"
                      >
                        View LangSmith Trace
                      </a>
                    )}
                    <Link to="/prompt2blog/articles" className="p2b-rerun-btn">
                      View Saved Articles
                    </Link>
                  </div>
                  <p><strong>Status:</strong> {pipelineResult.pipeline_status}</p>
                  <p><strong>Article Type:</strong> {pipelineResult.article_type.name}</p>
                  <p><strong>Model Used:</strong> {pipelineResult.quality_review.model_used}</p>
                  <p><strong>Title:</strong> {pipelineResult.improved_article.title}</p>
                  <p><strong>Quality Summary:</strong> {pipelineResult.quality_review.quality_summary}</p>

                  <div className="p2b-synthesized-text">
                    {pipelineResult.final_markdown.split('\n').map((line, index) => (
                      <p key={index}>{line || '\u00A0'}</p>
                    ))}
                  </div>

                  {pipelineDebugData && (
                    <div className="p2b-final-debug">
                      <button
                        type="button"
                        className="p2b-rerun-btn"
                        onClick={() => setShowPipelineDebug(prev => !prev)}
                      >
                        {showPipelineDebug ? 'Hide' : 'Show'} Pipeline Debug
                      </button>
                      {showPipelineDebug && (
                        <div className="p2b-raw-json">
                          <pre>{JSON.stringify(pipelineDebugData, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="p2b-error">{error}</div>}
            {isLoading && (
              <div className="p2b-loading">
                <div className="p2b-spinner" />
                <span>{loadingLabel}</span>
              </div>
            )}
          </section>

          <div className="p2b-submit-row">
            <button type="button" className="p2b-copy-json-btn" onClick={handleCopyJson}>
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button type="button" className="p2b-clear-btn" onClick={handleClear}>
              Clear All
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
