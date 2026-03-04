import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../assets/payload-logo.svg?url'
import {
  getPrompt2BlogDebug,
  getPrompt2BlogResult,
  getPrompt2BlogStatus,
  startPrompt2BlogRun,
  type Prompt2BlogPipelinePayload,
  type Prompt2BlogStatusResponse,
} from './api'
import './styles.css'

interface LocationFields {
  country: string
  city: string
  neighborhood: string
}

interface VoiceFields {
  publication_style_reference: string
  tone: string
  brand_identity: string
}

interface FormattingFields {
  paragraph_length: string
  target_word_count: number
}

interface SeoFields {
  primary_keyword: string
  secondary_keywords: string
}

interface RawBlob {
  id: number
  content: string
}

interface P2BFormState {
  location: LocationFields
  topic: string
  audience: string
  goal: string
  perspective: string
  voice: VoiceFields
  formatting: FormattingFields
  callToAction: string
  seo: SeoFields
  editorialInstructions: string
  enableEditorialAugmentation: boolean
  blobs: RawBlob[]
}

const STORAGE_KEY = 'p2b-form-draft'
const RUN_STORAGE_KEY = 'p2b-run-state'

const DEFAULT_STATE: P2BFormState = {
  location: { country: '', city: '', neighborhood: '' },
  topic: '',
  audience: '',
  goal: '',
  perspective: '',
  voice: { publication_style_reference: '', tone: '', brand_identity: '' },
  formatting: { paragraph_length: 'Medium (3–5 sentences per paragraph)', target_word_count: 500 },
  callToAction: '',
  seo: { primary_keyword: '', secondary_keywords: '' },
  editorialInstructions: '',
  enableEditorialAugmentation: true,
  blobs: [{ id: 1, content: '' }],
}

function loadSavedState(): P2BFormState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<P2BFormState>
    return { ...DEFAULT_STATE, ...parsed }
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
  'stage_synthesize_sources',
  'stage_classify_article_type',
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
  stage_synthesize_sources: 'Synthesize raw sources',
  stage_classify_article_type: 'Classify article type',
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

export default function Prompt2BlogPage() {
  const saved = useRef(loadSavedState())
  const savedRun = useRef(loadSavedRunState())

  const [location, setLocation] = useState<LocationFields>(saved.current.location)
  const [topic, setTopic] = useState(saved.current.topic)
  const [audience, setAudience] = useState(saved.current.audience)
  const [goal, setGoal] = useState(saved.current.goal)
  const [perspective, setPerspective] = useState(saved.current.perspective)
  const [voice, setVoice] = useState<VoiceFields>(saved.current.voice)
  const [formatting, setFormatting] = useState<FormattingFields>(saved.current.formatting)
  const [callToAction, setCallToAction] = useState(saved.current.callToAction)
  const [seo, setSeo] = useState<SeoFields>(saved.current.seo)
  const [editorialInstructions, setEditorialInstructions] = useState(saved.current.editorialInstructions)
  const [enableEditorialAugmentation, setEnableEditorialAugmentation] = useState(
    saved.current.enableEditorialAugmentation ?? true,
  )
  const [blobs, setBlobs] = useState<RawBlob[]>(saved.current.blobs)

  // Persist to localStorage on every change
  useEffect(() => {
    const state: P2BFormState = {
      location, topic, audience, goal, perspective,
      voice, formatting, callToAction, seo, editorialInstructions, enableEditorialAugmentation, blobs,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [
    location,
    topic,
    audience,
    goal,
    perspective,
    voice,
    formatting,
    callToAction,
    seo,
    editorialInstructions,
    enableEditorialAugmentation,
    blobs,
  ])

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

  const hasBlobs = blobs.some(b => b.content.trim())

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

  const buildJson = useMemo(() => ({
    location: {
      country: location.country || null,
      city: location.city || null,
      neighborhood: location.neighborhood || null,
    },
    topic: topic || null,
    audience: audience || null,
    goal: goal || null,
    perspective: perspective || null,
    voice: {
      publication_style_reference: voice.publication_style_reference || null,
      tone: voice.tone || null,
      brand_identity: voice.brand_identity || null,
    },
    formatting: {
      paragraph_length: formatting.paragraph_length,
      target_word_count: formatting.target_word_count,
    },
    call_to_action: callToAction || null,
    seo: {
      primary_keyword: seo.primary_keyword || null,
      secondary_keywords: seo.secondary_keywords
        ? seo.secondary_keywords.split(',').map(k => k.trim()).filter(Boolean)
        : [],
    },
    editorial_instructions: editorialInstructions || null,
    raw_input: {
      blobs: blobs
        .filter(b => b.content.trim())
        .map(b => ({ content: b.content })),
    },
  }), [location, topic, audience, goal, perspective, voice, formatting, callToAction, seo, editorialInstructions, blobs])

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
    navigator.clipboard.writeText(JSON.stringify(buildJson, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setError('Unable to copy JSON to clipboard.')
    })
  }, [buildJson])

  const handleRunPipeline = useCallback(async () => {
    const rawSources = blobs.map(blob => blob.content.trim()).filter(Boolean)
    if (!rawSources.length) {
      setError('At least one raw source is required before running the pipeline.')
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
      const startResponse = await startPrompt2BlogRun({
        raw_sources: rawSources,
        writing_brief: buildJson as Record<string, unknown>,
        include_debug: true,
        enable_editorial_augmentation: enableEditorialAugmentation,
      })

      appendPipelineLog(`Pipeline started. Run ID: ${startResponse.run_id}`)
      appendPipelineLog(
        `Editorial blocks ${enableEditorialAugmentation ? 'enabled' : 'disabled'} for this run.`,
      )
      setLoadingLabel('Running final article pipeline...')
      setPipelineRunId(startResponse.run_id)
      setSourceStep('pipeline_running')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start final pipeline'
      setError(message)
      appendPipelineLog(`Pipeline start failed: ${message}`, 'error')
      setIsLoading(false)
    }
  }, [appendPipelineLog, blobs, buildJson, enableEditorialAugmentation])

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
    setLocation(DEFAULT_STATE.location)
    setTopic(DEFAULT_STATE.topic)
    setAudience(DEFAULT_STATE.audience)
    setGoal(DEFAULT_STATE.goal)
    setPerspective(DEFAULT_STATE.perspective)
    setVoice(DEFAULT_STATE.voice)
    setFormatting(DEFAULT_STATE.formatting)
    setCallToAction(DEFAULT_STATE.callToAction)
    setSeo(DEFAULT_STATE.seo)
    setEditorialInstructions(DEFAULT_STATE.editorialInstructions)
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
          <h1>Craft articles from a <span className="p2b-underline-text">prompt</span><span className="p2b-dot">.</span></h1>
          <p className="p2b-lede">
            Fill out content parameters and let AI generate polished, publish-ready articles from your raw material.
          </p>
        </div>
        <div className="p2b-badge-row">
          <Link to="/" className="p2b-nav-link">&larr; Home</Link>
          <Link to="/prompt2blog/articles" className="p2b-nav-link">Saved Articles</Link>
          <Link to="/prompt2blog/stage" className="p2b-nav-link">
            Staged ({(() => {
              try {
                const stored = localStorage.getItem('prompt2blog_staged_articles')
                return stored ? JSON.parse(stored).length : 0
              } catch {
                return 0
              }
            })()})
          </Link>
        </div>
      </header>

      <main className="p2b-form-container">
        <form className="p2b-form" onSubmit={(e) => e.preventDefault()}>

          {/* Location */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Location</h2>
              <p>Where is this article set? City and neighborhood are optional.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field-row p2b-field-row--3">
                <div className="p2b-field">
                  <label htmlFor="p2b-country">Country</label>
                  <input
                    id="p2b-country"
                    type="text"
                    placeholder="e.g., Japan"
                    value={location.country}
                    onChange={(e) => setLocation(prev => ({ ...prev, country: e.target.value }))}
                    className="p2b-input"
                  />
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-city">City</label>
                  <input
                    id="p2b-city"
                    type="text"
                    placeholder="e.g., Tokyo"
                    value={location.city}
                    onChange={(e) => setLocation(prev => ({ ...prev, city: e.target.value }))}
                    className="p2b-input"
                  />
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-neighborhood">Neighborhood</label>
                  <input
                    id="p2b-neighborhood"
                    type="text"
                    placeholder="e.g., Shibuya"
                    value={location.neighborhood}
                    onChange={(e) => setLocation(prev => ({ ...prev, neighborhood: e.target.value }))}
                    className="p2b-input"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Topic & Audience */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Topic & Audience</h2>
              <p>Define what the article is about and who it's for.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-topic">Topic</label>
                <input
                  id="p2b-topic"
                  type="text"
                  placeholder="e.g., Japan Expands Visa-Free Travel to Additional Countries"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-audience">Audience</label>
                <input
                  id="p2b-audience"
                  type="text"
                  placeholder="e.g., International travelers, frequent flyers, digital nomads"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-goal">Goal</label>
                <textarea
                  id="p2b-goal"
                  placeholder="e.g., Inform readers about Japan's updated visa-free travel policy and its impact on tourism"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={2}
                  className="p2b-textarea"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-perspective">Perspective</label>
                <input
                  id="p2b-perspective"
                  type="text"
                  placeholder="e.g., Travel journalist reporting on official policy changes"
                  value={perspective}
                  onChange={(e) => setPerspective(e.target.value)}
                  className="p2b-input"
                />
              </div>
            </div>
          </section>

          {/* Voice */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Voice & Tone</h2>
              <p>Set the style, tone, and brand identity for the article.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-style-ref">Publication Style Reference</label>
                <input
                  id="p2b-style-ref"
                  type="text"
                  placeholder="e.g., High-end global travel journalism with cultural context"
                  value={voice.publication_style_reference}
                  onChange={(e) => setVoice(prev => ({ ...prev, publication_style_reference: e.target.value }))}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-tone">Tone</label>
                <input
                  id="p2b-tone"
                  type="text"
                  placeholder="e.g., Informative, polished, globally minded, optimistic"
                  value={voice.tone}
                  onChange={(e) => setVoice(prev => ({ ...prev, tone: e.target.value }))}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-brand">Brand Identity</label>
                <input
                  id="p2b-brand"
                  type="text"
                  placeholder="e.g., Premium travel publication with authority, clarity, and global perspective"
                  value={voice.brand_identity}
                  onChange={(e) => setVoice(prev => ({ ...prev, brand_identity: e.target.value }))}
                  className="p2b-input"
                />
              </div>
            </div>
          </section>

          {/* Formatting */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Formatting</h2>
              <p>Control paragraph length and target word count.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field-row p2b-field-row--2">
                <div className="p2b-field">
                  <label htmlFor="p2b-para-length">Paragraph Length</label>
                  <select
                    id="p2b-para-length"
                    value={formatting.paragraph_length}
                    onChange={(e) => setFormatting(prev => ({ ...prev, paragraph_length: e.target.value }))}
                    className="p2b-select"
                  >
                    <option value="Short (1–2 sentences per paragraph)">Short (1-2 sentences)</option>
                    <option value="Medium (3–5 sentences per paragraph)">Medium (3-5 sentences)</option>
                    <option value="Long (5–8 sentences per paragraph)">Long (5-8 sentences)</option>
                  </select>
                </div>
                <div className="p2b-field">
                  <label htmlFor="p2b-word-count">Target Word Count</label>
                  <input
                    id="p2b-word-count"
                    type="number"
                    min={100}
                    max={5000}
                    step={50}
                    value={formatting.target_word_count}
                    onChange={(e) => setFormatting(prev => ({ ...prev, target_word_count: Number(e.target.value) }))}
                    className="p2b-input"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SEO */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>SEO</h2>
              <p>Optimize the article for search engines.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-primary-kw">Primary Keyword</label>
                <input
                  id="p2b-primary-kw"
                  type="text"
                  placeholder="e.g., Japan visa-free travel update"
                  value={seo.primary_keyword}
                  onChange={(e) => setSeo(prev => ({ ...prev, primary_keyword: e.target.value }))}
                  className="p2b-input"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-secondary-kws">Secondary Keywords</label>
                <input
                  id="p2b-secondary-kws"
                  type="text"
                  placeholder="Comma-separated, e.g., Japan travel policy, visa-free entry Japan"
                  value={seo.secondary_keywords}
                  onChange={(e) => setSeo(prev => ({ ...prev, secondary_keywords: e.target.value }))}
                  className="p2b-input"
                />
              </div>
            </div>
          </section>

          {/* Call to Action & Editorial Instructions */}
          <section className="p2b-panel">
            <div className="p2b-panel-header">
              <h2>Editorial</h2>
              <p>Provide a call to action and any editorial instructions for the AI.</p>
            </div>
            <div className="p2b-panel-body">
              <div className="p2b-field">
                <label htmlFor="p2b-cta">Call to Action</label>
                <textarea
                  id="p2b-cta"
                  placeholder="e.g., Encourage readers to monitor official announcements and begin planning future trips"
                  value={callToAction}
                  onChange={(e) => setCallToAction(e.target.value)}
                  rows={2}
                  className="p2b-textarea"
                />
              </div>
              <div className="p2b-field">
                <label htmlFor="p2b-editorial">Editorial Instructions</label>
                <textarea
                  id="p2b-editorial"
                  placeholder="e.g., Synthesize the raw source material into a coherent, professionally written article. Ignore formatting artifacts..."
                  value={editorialInstructions}
                  onChange={(e) => setEditorialInstructions(e.target.value)}
                  rows={3}
                  className="p2b-textarea"
                />
              </div>
            </div>
          </section>

          {/* Raw Source Material and one-button pipeline */}
          <section className="p2b-panel p2b-panel--source">
            <div className="p2b-panel-header">
              <h2>Raw Source Material</h2>
              <p>
                Paste raw text blobs. One click will synthesize, classify, fetch guidelines, and generate the
                final article.
              </p>
            </div>

            <div className="p2b-panel-body">
              {blobs.map((blob, index) => (
                <div key={blob.id} className="p2b-blob-field">
                  <div className="p2b-blob-header">
                    <label>Source {index + 1}</label>
                    {blobs.length > 1 && (
                      <button
                        type="button"
                        className="p2b-blob-remove"
                        onClick={() => removeBlob(blob.id)}
                        aria-label="Remove source"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <textarea
                    placeholder="Paste raw text, article excerpt, social post, HTML, or notes..."
                    value={blob.content}
                    onChange={(e) => updateBlob(blob.id, e.target.value)}
                    rows={4}
                    className="p2b-textarea"
                  />
                </div>
              ))}

              <button type="button" className="p2b-add-blob-btn" onClick={addBlob}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Add Another Source
              </button>

              <label className="p2b-toggle-row">
                <input
                  type="checkbox"
                  checked={enableEditorialAugmentation}
                  disabled={isLoading}
                  onChange={(e) => setEnableEditorialAugmentation(e.target.checked)}
                />
                <span>Enable editorial blocks augmentation</span>
              </label>

              <div className="p2b-panel-actions">
                <button
                  type="button"
                  className="p2b-synthesize-btn"
                  disabled={!hasBlobs || isLoading}
                  onClick={handleRunPipeline}
                >
                  {sourceStep === 'pipeline_running' ? 'Running Final Pipeline...' : 'Generate Final Article'}
                </button>
                {(pipelineRunId || pipelineResult) && (
                  <button
                    type="button"
                    className="p2b-rerun-btn"
                    onClick={handleResetRun}
                    disabled={isLoading}
                  >
                    Reset Run State
                  </button>
                )}
              </div>

              {(pipelineRunId || sourceStep !== 'edit' || pipelineLogs.length > 0) && (
                <div className="p2b-pipeline-progress">
                  <h3>Final Pipeline Progress</h3>
                  <div className="p2b-stage-checklist">
                    {PIPELINE_STAGE_ORDER.map(step => {
                      const status = getPipelineStepStatus(step, pipelineStatus)
                      return (
                        <div key={step} className={`p2b-stage-item ${status}`}>
                          <div className="p2b-stage-dot" />
                          <span>{PIPELINE_STAGE_LABELS[step] || step}</span>
                        </div>
                      )
                    })}
                  </div>

                  {pipelineRunId && (
                    <p className="p2b-pipeline-runid">
                      <strong>Run ID:</strong> {pipelineRunId}
                    </p>
                  )}

                  {pipelineLogs.length > 0 && (
                    <div className="p2b-pipeline-log">
                      <h4>Process Log</h4>
                      {pipelineLogs.map(entry => (
                        <div key={entry.id} className={`p2b-log-line p2b-log-line--${entry.level}`}>
                          <span className="p2b-log-time">{entry.at}</span>
                          <span>{entry.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                  <p>
                    <strong>Status:</strong> {pipelineResult.pipeline_status}
                  </p>
                  <p>
                    <strong>Article Type:</strong> {pipelineResult.article_type.name}
                  </p>
                  <p>
                    <strong>Title:</strong> {pipelineResult.improved_article.title}
                  </p>
                  <p>
                    <strong>Quality Summary:</strong> {pipelineResult.quality_review.quality_summary}
                  </p>
                  <p>
                    <strong>Editorial Augmentation:</strong>{' '}
                    {pipelineResult.quality_review.editorial_augmentation_applied ?? false
                      ? 'Applied'
                      : 'Not applied'}
                  </p>
                  <p>
                    <strong>Editorial Summary:</strong>{' '}
                    {pipelineResult.quality_review.editorial_augmentation_summary
                      || 'No editorial summary available.'}
                  </p>
                  <p>
                    <strong>Editorial Components:</strong>{' '}
                    {(pipelineResult.quality_review.editorial_components_added || []).length
                      ? (pipelineResult.quality_review.editorial_components_added || [])
                        .map(component => component.component)
                        .join(', ')
                      : 'None'}
                  </p>
                  <p>
                    <strong>Editorial Diagnostic:</strong>{' '}
                    {Object.entries(pipelineResult.quality_review.editorial_diagnostic || {}).length
                      ? Object.entries(pipelineResult.quality_review.editorial_diagnostic || {})
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(' | ')
                      : 'Not available'}
                  </p>

                  {(pipelineResult.quality_review.editorial_components_added || []).length > 0 && (
                    <div className="p2b-guideline-card">
                      <div className="p2b-guideline-card-header">
                        <h3>Editorial Component Details</h3>
                      </div>
                      {(pipelineResult.quality_review.editorial_components_added || []).map((component, index) => (
                        <p key={`${component.component}-${index}`}>
                          <strong>{component.component}</strong>
                          {' - '}
                          {component.justification || 'No justification provided.'}
                          {component.placement ? ` (${component.placement})` : ''}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="p2b-synthesized-text">
                    {pipelineResult.final_markdown.split('\n').map((line, i) => (
                      <p key={i}>{line || '\u00A0'}</p>
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

            {/* Error — inside the panel */}
            {error && (
              <div className="p2b-error">
                {error}
              </div>
            )}

            {/* Loading — inside the panel */}
            {isLoading && (
              <div className="p2b-loading">
                <div className="p2b-spinner" />
                <span>{loadingLabel}</span>
              </div>
            )}
          </section>

          {/* Utility buttons */}
          <div className="p2b-submit-row">
            <button type="button" className="p2b-copy-json-btn" onClick={handleCopyJson}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/>
              </svg>
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
