import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../assets/payload-logo.svg?url'
import {
  fetchLatestStatus,
  fetchStatus,
  runUrl2BlogPipelineV2,
  type Url2BlogExecutionProfile,
  type Url2BlogModel,
  type Url2BlogPipelineV2Response,
  type Url2BlogStageTrace,
  type Url2BlogStatusResponse,
} from './api'
import { normalizeArticleUrlInput } from './urlInput'
import './styles.css'

type WizardStep = 'input' | 'processing' | 'complete'
type TraceStatus = 'completed' | 'skipped' | 'error'
type TracePhase = {
  key: string
  title: string
  description: string
}

type NarrativeFocusPreset = {
  id: string
  label: string
  prompt: string
}

type ProgressItemState = 'pending' | 'running' | 'done' | 'failed'
type Url2BlogProgressStep = {
  key: string
  stage: string | null
  label: string
}

const NARRATIVE_FOCUS_PRESETS: NarrativeFocusPreset[] = [
  {
    id: 'practical_trip_planner',
    label: 'Practical Trip Planner',
    prompt:
      'Prioritize decision-ready guidance for planning: where to go, what to book, and how to avoid common mistakes.',
  },
  {
    id: 'beginner_friendly_explainer',
    label: 'Beginner-Friendly Explainer',
    prompt:
      'Write for first-timers. Define jargon, explain why each point matters, and keep instructions clear and confidence-building.',
  },
  {
    id: 'expert_depth',
    label: 'Expert Depth',
    prompt:
      'Assume informed readers. Emphasize nuance, tradeoffs, and advanced context instead of generic introductory advice.',
  },
  {
    id: 'executive_summary',
    label: 'Executive Summary',
    prompt:
      'Front-load key takeaways and high-impact recommendations for readers with limited time.',
  },
  {
    id: 'budget_maximizer',
    label: 'Budget Maximizer',
    prompt:
      'Focus on affordability, value-for-money options, and practical cost-saving decisions without sacrificing quality.',
  },
  {
    id: 'luxury_premium',
    label: 'Luxury Premium',
    prompt:
      'Target premium travelers seeking high-end comfort, service quality, and elevated experiences.',
  },
  {
    id: 'family_friendly',
    label: 'Family-Friendly',
    prompt:
      'Optimize recommendations for families with children, including safety, convenience, and age-appropriate choices.',
  },
  {
    id: 'solo_traveler',
    label: 'Solo Traveler',
    prompt:
      'Write for solo readers who need confidence, situational awareness, and independent planning guidance.',
  },
  {
    id: 'safety_first',
    label: 'Safety-First',
    prompt:
      'Prioritize safety and risk-reduction details, including practical precautions and common pitfalls to avoid.',
  },
  {
    id: 'sustainable_responsible',
    label: 'Sustainable & Responsible',
    prompt:
      'Emphasize environmentally responsible and culturally respectful choices with practical alternatives.',
  },
  {
    id: 'local_culture',
    label: 'Local Culture Lens',
    prompt:
      'Highlight local context, cultural etiquette, and authentic experiences rather than surface-level tourist framing.',
  },
  {
    id: 'myth_busting',
    label: 'Myth-Busting Angle',
    prompt:
      'Challenge common misconceptions and replace them with evidence-based guidance and balanced reasoning.',
  },
  {
    id: 'step_by_step',
    label: 'Step-by-Step Playbook',
    prompt:
      'Structure advice into clear, actionable steps that readers can follow in sequence.',
  },
  {
    id: 'comparison_framework',
    label: 'Comparison Framework',
    prompt:
      'Present options with pros, cons, and decision criteria so readers can choose based on their priorities.',
  },
  {
    id: 'human_story',
    label: 'Human Story',
    prompt:
      'Lean into narrative clarity and human moments while preserving factual usefulness and trust.',
  },
  {
    id: 'data_evidence',
    label: 'Data & Evidence',
    prompt:
      'Ground claims with verifiable facts, concrete examples, and explicit reasoning to reduce fluff.',
  },
  {
    id: 'problem_solution',
    label: 'Problem-Solution',
    prompt:
      'Frame content around reader pain points and practical solutions with direct implementation advice.',
  },
  {
    id: 'checklist_ready',
    label: 'Checklist-Ready',
    prompt:
      'Organize material into concise, scannable checklist logic without losing depth where needed.',
  },
  {
    id: 'journalistic_neutral',
    label: 'Journalistic Neutral',
    prompt:
      'Keep tone balanced and credible, separating claims from interpretation while maintaining readability.',
  },
  {
    id: 'conversion_oriented',
    label: 'Conversion-Oriented',
    prompt:
      'Prioritize clarity that helps readers confidently take next actions such as booking, comparing, or planning.',
  },
]

const URL2BLOG_PROGRESS_STEPS: Url2BlogProgressStep[] = [
  { key: 'submitted', stage: null, label: 'URL submitted' },
  { key: 'stage_1', stage: 'stage_1', label: 'Stage 1: Extract article' },
  { key: 'stage_2', stage: 'stage_2', label: 'Stage 2: Classify article type' },
  {
    key: 'editorial_blueprint',
    stage: 'editorial_blueprint',
    label: 'Plan editorial blueprint',
  },
  { key: 'rewrite_quality', stage: 'rewrite_quality', label: 'Rewrite + quality checks' },
  { key: 'fact_length', stage: 'fact_length', label: 'Fact retention + length checks' },
  {
    key: 'editorial_augmentation',
    stage: 'editorial_augmentation',
    label: 'Editorial augmentation',
  },
  {
    key: 'editorial_post_recheck',
    stage: 'editorial_post_recheck',
    label: 'Post-editorial recheck',
  },
  { key: 'complete', stage: 'complete', label: 'Finalize output' },
]

const URL2BLOG_PROGRESS_STAGE_ORDER = URL2BLOG_PROGRESS_STEPS
  .map((step) => step.stage)
  .filter((stage): stage is string => Boolean(stage))

function createRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `url2blog-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getStageLabel(stage: string | null): string {
  if (stage === 'stage_1') return 'Stage 1: Extract article'
  if (stage === 'stage_2') return 'Stage 2: Classify article type'
  if (stage === 'editorial_blueprint') return 'Plan editorial blueprint'
  if (stage === 'rewrite_quality') return 'Rewrite + quality checks'
  if (stage === 'fact_length') return 'Fact retention + length checks'
  if (stage === 'editorial_augmentation') return 'Editorial augmentation'
  if (stage === 'editorial_post_recheck') return 'Post-editorial recheck'
  if (stage === 'complete') return 'Finalize output'
  return 'Preparing pipeline'
}

function getProgressItemState(
  step: Url2BlogProgressStep,
  status: Url2BlogStatusResponse | null | undefined
): ProgressItemState {
  if (step.stage === null) {
    return 'done'
  }

  const activeStage = typeof status?.stage === 'string' ? status.stage : null
  const activeIndex = activeStage ? URL2BLOG_PROGRESS_STAGE_ORDER.indexOf(activeStage) : -1
  const itemIndex = URL2BLOG_PROGRESS_STAGE_ORDER.indexOf(step.stage)

  if (status?.state === 'completed') {
    return 'done'
  }

  if (status?.state === 'failed') {
    if (activeStage === step.stage) {
      return 'failed'
    }
    return activeIndex > itemIndex ? 'done' : 'pending'
  }

  if (activeIndex === -1) {
    return 'pending'
  }

  if (activeIndex > itemIndex) return 'done'
  if (activeIndex === itemIndex) return 'running'
  return 'pending'
}

function toTitleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function getTraceCallLabel(stage: string): string {
  if (stage.startsWith('length_expansion_pass_')) {
    const pass = stage.replace('length_expansion_pass_', '')
    return `Length expansion pass ${pass}`
  }

  const labels: Record<string, string> = {
    stage1_extract_article: 'Extract article from URL',
    stage1_translate_article: 'Translate article to English',
    stage2_classification: 'Classify article type',
    editorial_blueprint: 'Plan editorial blueprint',
    short_article_enrichment: 'Collect grounded context',
    source_facts_extraction: 'Extract source facts',
    guideline_rewrite_initial: 'Initial guideline rewrite',
    quality_audit_initial: 'Initial quality audit',
    rewrite_repair_second_pass: 'Second-pass rewrite repair',
    quality_audit_after_second_pass: 'Quality audit after second pass',
    fact_coverage_audit_initial: 'Initial fact-coverage audit',
    fact_repair: 'Repair missing facts',
    quality_audit_after_fact_repair: 'Quality audit after fact repair',
    fact_coverage_audit_after_fact_repair: 'Fact-coverage audit after repair',
    length_expansion: 'Length expansion gate',
    quality_audit_after_length_expansion: 'Quality audit after length expansion',
    fact_coverage_audit_after_length_expansion: 'Fact-coverage audit after length expansion',
    editorial_augmentation: 'Editorial augmentation',
    editorial_post_recheck: 'Post-editorial recheck',
    editorial_post_recheck_quality_audit: 'Post-editorial quality audit',
    editorial_post_recheck_fact_coverage: 'Post-editorial fact-coverage audit',
    finalize_output: 'Finalize output',
  }

  return labels[stage] ?? toTitleCase(stage)
}

function getTracePhase(stage: string): TracePhase {
  if (stage.startsWith('stage1_')) {
    return {
      key: 'phase_1_source_extraction',
      title: 'Phase 1: Source Extraction',
      description: 'Fetch article text, extract content, and translate if needed.',
    }
  }
  if (stage === 'stage2_classification') {
    return {
      key: 'phase_2_classification',
      title: 'Phase 2: Classification',
      description: 'Classify the article into the selected content type.',
    }
  }
  if (stage === 'short_article_enrichment') {
    return {
      key: 'phase_3_enrichment',
      title: 'Phase 3: External Enrichment',
      description: 'Optionally gather grounded context for short source articles.',
    }
  }
  if (stage === 'source_facts_extraction') {
    return {
      key: 'phase_4_fact_anchor_extraction',
      title: 'Phase 4: Fact Anchor Extraction',
      description: 'Extract key source facts used for retention and audits.',
    }
  }
  if (stage === 'editorial_blueprint') {
    return {
      key: 'phase_5_editorial_blueprint',
      title: 'Phase 5: Editorial Blueprint',
      description: 'Plan editorial components before drafting the article.',
    }
  }
  if (stage === 'guideline_rewrite_initial' || stage === 'rewrite_repair_second_pass') {
    return {
      key: 'phase_6_rewrite',
      title: 'Phase 6: Guideline Rewrite',
      description: 'Produce and optionally repair the rewritten draft.',
    }
  }
  if (stage.startsWith('quality_audit_') || stage === 'quality_audit_initial') {
    return {
      key: 'phase_7_quality',
      title: 'Phase 7: Quality Audits',
      description: 'Evaluate guideline alignment, informativeness, and originality.',
    }
  }
  if (stage.startsWith('fact_coverage_') || stage === 'fact_repair') {
    return {
      key: 'phase_8_fact_retention',
      title: 'Phase 8: Fact Retention',
      description: 'Audit factual coverage and repair missing high-priority facts.',
    }
  }
  if (stage.startsWith('length_expansion')) {
    return {
      key: 'phase_9_length_expansion',
      title: 'Phase 9: Length Expansion',
      description: 'Expand article depth to satisfy minimum length targets.',
    }
  }
  if (stage === 'editorial_augmentation') {
    return {
      key: 'phase_10_editorial_augmentation',
      title: 'Phase 10: Editorial Augmentation',
      description: 'Optionally add editorial components for readability.',
    }
  }
  if (
    stage === 'editorial_post_recheck' ||
    stage === 'editorial_post_recheck_quality_audit' ||
    stage === 'editorial_post_recheck_fact_coverage'
  ) {
    return {
      key: 'phase_11_editorial_recheck',
      title: 'Phase 11: Editorial Recheck',
      description: 'Validate post-editorial quality/fact integrity with rollback fallback.',
    }
  }
  if (stage === 'finalize_output') {
    return {
      key: 'phase_12_finalize',
      title: 'Phase 12: Finalization',
      description: 'Assemble final markdown and response payload.',
    }
  }

  return {
    key: 'phase_misc',
    title: 'Phase: Miscellaneous',
    description: 'Additional pipeline steps.',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getTraceStatus(entry: Url2BlogStageTrace): TraceStatus {
  if (entry.error) return 'error'
  if (isRecord(entry.output) && entry.output.skipped === true) return 'skipped'
  return 'completed'
}

function getTraceStatusLabel(status: TraceStatus): string {
  if (status === 'error') return 'Error'
  if (status === 'skipped') return 'Skipped'
  return 'Completed'
}

function groupPipelineTrace(trace: Url2BlogStageTrace[]) {
  const phaseOrder: string[] = []
  const phaseMap = new Map<
    string,
    {
      phase: TracePhase
      calls: Array<{ entry: Url2BlogStageTrace; index: number; callLabel: string }>
    }
  >()

  trace.forEach((entry, index) => {
    const phase = getTracePhase(entry.stage)
    const existing = phaseMap.get(phase.key)
    if (!existing) {
      phaseMap.set(phase.key, {
        phase,
        calls: [{ entry, index, callLabel: getTraceCallLabel(entry.stage) }],
      })
      phaseOrder.push(phase.key)
      return
    }

    existing.calls.push({ entry, index, callLabel: getTraceCallLabel(entry.stage) })
  })

  return phaseOrder
    .map((key) => phaseMap.get(key))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
}

export default function Url2BlogPage() {
  const [url, setUrl] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [selectedNarrativeFocusPresetId, setSelectedNarrativeFocusPresetId] = useState('')
  const [customNarrativeFocus, setCustomNarrativeFocus] = useState('')
  const [includeDebug, setIncludeDebug] = useState(true)
  const [modelName, setModelName] = useState<Url2BlogModel>('gemini-2.5-flash')
  const [executionProfile, setExecutionProfile] =
    useState<Url2BlogExecutionProfile>('standard')
  const [runSubmittedAt, setRunSubmittedAt] = useState<number | null>(null)
  const [result, setResult] = useState<Url2BlogPipelineV2Response | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [showTrace, setShowTrace] = useState(false)

  const selectedNarrativeFocusPreset = useMemo(
    () =>
      NARRATIVE_FOCUS_PRESETS.find((preset) => preset.id === selectedNarrativeFocusPresetId) ?? null,
    [selectedNarrativeFocusPresetId]
  )

  const narrativeFocus = useMemo(() => {
    const parts: string[] = []
    if (selectedNarrativeFocusPreset) {
      parts.push(selectedNarrativeFocusPreset.prompt)
    }

    const customFocus = customNarrativeFocus.trim()
    if (customFocus) {
      parts.push(customFocus)
    }

    return parts.join('\n\n')
  }, [selectedNarrativeFocusPreset, customNarrativeFocus])

  const pipelineMutation = useMutation<
    Url2BlogPipelineV2Response,
    Error,
    { runId: string; url: string }
  >({
    mutationFn: async ({ runId, url: normalizedUrl }) => {
      return runUrl2BlogPipelineV2({
        run_id: runId,
        url: normalizedUrl,
        include_debug: includeDebug,
        narrative_focus: narrativeFocus.trim() || undefined,
        model_name: modelName,
        execution_profile: executionProfile,
      })
    },
    onSuccess: (data) => {
      if (data.run_id) {
        setActiveRunId(data.run_id)
      }
      setResult(data)
    },
  })

  const statusQuery = useQuery({
    queryKey: ['url2blog-status', activeRunId],
    queryFn: async () => {
      const now = Date.now()
      const allowNotFoundBootstrap =
        pipelineMutation.isPending && runSubmittedAt !== null && now - runSubmittedAt < 12_000
      try {
        return await fetchStatus(activeRunId as string, {
          allowNotFound: allowNotFoundBootstrap,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const shouldTryLatest =
          pipelineMutation.isPending &&
          message.includes('Run not found for') &&
          !allowNotFoundBootstrap
        if (!shouldTryLatest) {
          throw error
        }
        const latest = await fetchLatestStatus()
        if (!latest || !latest.run_id) {
          throw error
        }
        const updatedAtMs = Date.parse(latest.updated_at)
        if (!Number.isFinite(updatedAtMs) || now - updatedAtMs > 120_000) {
          throw error
        }
        if (!['running', 'completed', 'failed'].includes(latest.state)) {
          throw error
        }
        return latest
      }
    },
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const current = query.state.data as Url2BlogStatusResponse | null | undefined
      if (!pipelineMutation.isPending) {
        return false
      }
      if (current && (current.state === 'completed' || current.state === 'failed')) {
        return false
      }
      return 1000
    },
  })

  const activeStatus = statusQuery.data ?? null
  useEffect(() => {
    if (!activeStatus?.run_id || !activeRunId) return
    if (activeStatus.run_id === activeRunId) return
    setActiveRunId(activeStatus.run_id)
  }, [activeStatus?.run_id, activeRunId])
  const activeStage = typeof activeStatus?.stage === 'string' ? activeStatus.stage : null
  const liveStageLabel = getStageLabel(activeStage)
  const processingSteps = useMemo(
    () =>
      URL2BLOG_PROGRESS_STEPS.map((step) => ({
        ...step,
        state: getProgressItemState(step, activeStatus),
      })),
    [activeStatus]
  )
  const statusErrorMessage =
    activeStatus?.state === 'failed' && activeStatus.error
      ? activeStatus.error
      : null
  const mutationErrorMessage =
    pipelineMutation.error instanceof Error ? pipelineMutation.error.message : null

  const currentStep = useMemo((): WizardStep => {
    if (pipelineMutation.isPending) return 'processing'
    if (result) return 'complete'
    return 'input'
  }, [pipelineMutation.isPending, result])

  const groupedTrace = useMemo(
    () => groupPipelineTrace(result?.debug?.pipeline_trace ?? []),
    [result?.debug?.pipeline_trace]
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedUrl = normalizeArticleUrlInput(url)
    if (!normalizedUrl) {
      setInputError('Enter a valid article URL. Bare domains are fine; we will add https:// for you.')
      return
    }
    const runId = createRunId()

    setInputError(null)
    setUrl(normalizedUrl)
    setActiveRunId(runId)
    setRunSubmittedAt(Date.now())
    setResult(null)
    setShowDetails(false)
    setShowRaw(false)
    setShowTrace(false)
    pipelineMutation.reset()
    pipelineMutation.mutate({ runId, url: normalizedUrl })
  }

  const handleStartOver = () => {
    setUrl('')
    setActiveRunId(null)
    setRunSubmittedAt(null)
    setSelectedNarrativeFocusPresetId('')
    setCustomNarrativeFocus('')
    setIncludeDebug(true)
    setModelName('gemini-2.5-flash')
    setExecutionProfile('standard')
    setResult(null)
    setShowDetails(false)
    setShowRaw(false)
    setShowTrace(false)
    pipelineMutation.reset()
  }

  const handleCopyMarkdown = () => {
    if (!result) return
    navigator.clipboard.writeText(result.final_markdown)
  }

  return (
    <div className="url2blog-page">
      <header className="url2blog-hero">
        <div>
          <p className="url2blog-eyebrow">Questurian Studio</p>
          <h1>
            Turn any article into <span className="url2blog-underline-text">a guideline-aligned draft</span>
            <span className="url2blog-teal-dot">.</span>
          </h1>
          <p className="url2blog-lede">Simple flow: extract, classify, rewrite, and return clean Markdown.</p>
        </div>
        <div className="url2blog-badge-row">
          <Link to="/" className="url2blog-nav-link">
            &larr; Home
          </Link>
          <Link to="/url2blog/articles" className="url2blog-nav-link">
            Saved Articles
          </Link>
          <Link to="/url2blog/stage" className="url2blog-nav-link">
            Staged ({(() => {
              try {
                const stored = localStorage.getItem('url2blog_staged_articles_v2')
                return stored ? JSON.parse(stored).length : 0
              } catch {
                return 0
              }
            })()})
          </Link>
        </div>
      </header>

      <main className="url2blog-wizard">
        {currentStep === 'input' && (
          <section className="url2blog-panel u2b-wizard-panel">
            <div className="url2blog-panel-header">
              <h2>Run URL2Blog v2</h2>
              <p>Paste an article URL and get a clean markdown output.</p>
            </div>
            <form className="url2blog-panel-body" onSubmit={handleSubmit}>
              <div className="url2blog-url-input">
                <label htmlFor="article-url">Article URL</label>
                <input
                  id="article-url"
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    if (inputError) {
                      setInputError(null)
                    }
                  }}
                  className="url2blog-url-field"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {inputError ? <p className="url2blog-error">{inputError}</p> : null}
              </div>
              <div className="url2blog-url-input">
                <label htmlFor="narrative-focus-preset">Narrative / Audience Focus (Optional)</label>
                <select
                  id="narrative-focus-preset"
                  value={selectedNarrativeFocusPresetId}
                  onChange={(event) => setSelectedNarrativeFocusPresetId(event.target.value)}
                  className="url2blog-url-field"
                >
                  <option value="">No preset (pipeline default)</option>
                  {NARRATIVE_FOCUS_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <div className="url2blog-focus-grid" role="listbox" aria-label="Narrative focus quick picks">
                  {NARRATIVE_FOCUS_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedNarrativeFocusPresetId(preset.id)}
                      className={`url2blog-focus-chip${
                        selectedNarrativeFocusPresetId === preset.id ? ' active' : ''
                      }`}
                      aria-selected={selectedNarrativeFocusPresetId === preset.id}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  id="narrative-focus-custom"
                  type="text"
                  placeholder="Optional custom add-on. Example: Keep tone grounded and avoid hype language."
                  value={customNarrativeFocus}
                  onChange={(event) => setCustomNarrativeFocus(event.target.value)}
                  className="url2blog-url-field"
                />
                <p className="url2blog-focus-preview">
                  {narrativeFocus
                    ? `Applied focus: ${narrativeFocus}`
                    : 'Applied focus: none (pipeline will use default editorial judgment).'}
                </p>
              </div>
              <div className="url2blog-url-input">
                <label htmlFor="model-name">Writing Model</label>
                <select
                  id="model-name"
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value as Url2BlogModel)}
                  className="url2blog-url-field"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast, less robotic)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deeper, slower)</option>
                  <option value="gemini-2.0-flash">Gemini 2.0 Flash (Lightweight)</option>
                </select>
              </div>
              <div className="url2blog-url-input">
                <label htmlFor="execution-profile">Execution Profile</label>
                <select
                  id="execution-profile"
                  value={executionProfile}
                  onChange={(event) =>
                    setExecutionProfile(event.target.value as Url2BlogExecutionProfile)
                  }
                  className="url2blog-url-field"
                >
                  <option value="standard">Standard (full quality path)</option>
                  <option value="lean">Lean (fewer expensive passes)</option>
                </select>
              </div>
              <div className="url2blog-url-input">
                <label htmlFor="include-debug">Debug Trace</label>
                <label className="url2blog-debug-checkbox" htmlFor="include-debug">
                  <input
                    id="include-debug"
                    type="checkbox"
                    checked={includeDebug}
                    onChange={(event) => setIncludeDebug(event.target.checked)}
                  />
                  <span>Capture full stage inputs, prompts, and raw model responses</span>
                </label>
              </div>
              <div className="url2blog-button-row">
                <button
                  type="submit"
                  className="url2blog-submit-btn"
                  disabled={!url.trim() || pipelineMutation.isPending}
                >
                  Run Simple Pipeline
                </button>
              </div>
              {pipelineMutation.isError ? (
                <p className="url2blog-error">
                  {statusErrorMessage || mutationErrorMessage || 'Pipeline failed. Check backend logs.'}
                </p>
              ) : null}
            </form>
          </section>
        )}

        {currentStep === 'processing' && (
          <section className="url2blog-panel u2b-wizard-panel u2b-processing-panel">
            <div className="u2b-processing-content">
              <div className="u2b-pipeline-progress-centered">
                <h3>Pipeline Progress</h3>
                <p className={`u2b-live-status ${activeStatus?.state ?? 'running'}`}>
                  {activeStatus?.state ?? 'running'}{activeRunId ? ` • ${activeRunId}` : ''}
                </p>
                <div className="u2b-stage-checklist">
                  {processingSteps.map((step) => (
                    <div key={step.key} className={`u2b-stage-item ${step.state}`}>
                      <div className="u2b-stage-dot" />
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="u2b-processing-message">Current step: {liveStageLabel}</p>
              {statusQuery.isError ? (
                <p className="url2blog-error">
                  Live status polling failed. {statusQuery.error instanceof Error ? statusQuery.error.message : ''}
                </p>
              ) : null}
              {statusErrorMessage ? <p className="url2blog-error">{statusErrorMessage}</p> : null}
            </div>
          </section>
        )}

        {currentStep === 'complete' && result && (
          <section className="url2blog-panel u2b-wizard-panel u2b-complete-panel">
            <div className="url2blog-panel-header">
              <div className="u2b-step-indicator u2b-complete-indicator">
                <span className="u2b-step-check">&check;</span>
                <span>Pipeline Complete</span>
              </div>
              <h2>{result.improved_article.title || result.article.original_title || 'Improved Article'}</h2>
              <p className="u2b-source-url">{result.article.source_url}</p>
            </div>

            <div className="url2blog-panel-body">
              <div className="u2b-extracted-content">
                <div className="u2b-meta-row">
                  <div className="u2b-language-badge">{result.article.language}</div>
                  <div className="u2b-selected-type-badge">{result.selected_article_type.name || 'Unclassified'}</div>
                  <div className="u2b-translated-badge">Ready for Drafting</div>
                  {result.article.translated && <div className="u2b-translated-badge">Translated to English</div>}
                </div>

                <div className="u2b-content-section">
                  <h3>Final Markdown</h3>
                  <div className="u2b-raw-json">
                    <pre>{result.final_markdown}</pre>
                  </div>
                </div>

                <div className="u2b-content-section">
                  <div className="u2b-raw-toggle">
                    <button
                      type="button"
                      className="url2blog-toggle-btn"
                      onClick={() => setShowDetails(!showDetails)}
                    >
                      {showDetails ? 'Hide' : 'Show'} Details
                    </button>
                  </div>
                </div>

                {showDetails && (
                  <>
                    <div className="u2b-content-section">
                      <h3>Guideline Alignment Summary</h3>
                      <div className="u2b-guideline-text">{result.guideline_review.alignment_summary}</div>
                    </div>
                    {result.guideline_review.quality_summary && (
                      <div className="u2b-content-section">
                        <h3>Quality Audit</h3>
                        <div className="u2b-guideline-text">{result.guideline_review.quality_summary}</div>
                        {result.guideline_review.narrative_focus_applied && (
                          <div className="u2b-guideline-text">
                            Narrative focus applied: {result.guideline_review.narrative_focus_applied}
                          </div>
                        )}
                        {result.guideline_review.model_used && (
                          <div className="u2b-guideline-text">Model used: {result.guideline_review.model_used}</div>
                        )}
                        {result.guideline_review.execution_profile && (
                          <div className="u2b-guideline-text">
                            Execution profile: {result.guideline_review.execution_profile}
                          </div>
                        )}
                        {typeof result.guideline_review.source_word_count === 'number' && (
                          <div className="u2b-guideline-text">
                            Source length: ~{result.guideline_review.source_word_count} words
                          </div>
                        )}
                        {result.pipeline_status === 'needs_revision' &&
                          result.guideline_review.length_requirement_blocking_reason && (
                            <div className="u2b-guideline-text">
                              Drafting gate: {result.guideline_review.length_requirement_blocking_reason}
                            </div>
                          )}
                        {typeof result.guideline_review.short_article_enrichment_applied === 'boolean' && (
                          <div className="u2b-guideline-text">
                            Google-grounded enrichment:{' '}
                            {result.guideline_review.short_article_enrichment_applied ? 'Applied' : 'Not needed'}
                            {typeof result.guideline_review.external_context_points_used === 'number' && (
                              <> ({result.guideline_review.external_context_points_used} context points)</>
                            )}
                          </div>
                        )}
                        {result.guideline_review.external_context_usage_note && (
                          <div className="u2b-guideline-text">
                            {result.guideline_review.external_context_usage_note}
                          </div>
                        )}
                        {typeof result.guideline_review.factual_coverage_score === 'number' && (
                          <div className="u2b-guideline-text">
                            Factual coverage: {result.guideline_review.factual_coverage_score}/10
                            {typeof result.guideline_review.missing_source_facts_count === 'number' && (
                              <> | Missing source facts: {result.guideline_review.missing_source_facts_count}</>
                            )}
                            {typeof result.guideline_review.missing_high_priority_facts_count === 'number' && (
                              <> | Missing high-priority facts: {result.guideline_review.missing_high_priority_facts_count}</>
                            )}
                          </div>
                        )}
                        {result.guideline_review.factual_coverage_summary && (
                          <div className="u2b-guideline-text">
                            {result.guideline_review.factual_coverage_summary}
                          </div>
                        )}
                        {typeof result.guideline_review.fact_repair_applied === 'boolean' && (
                          <div className="u2b-guideline-text">
                            Fact repair pass: {result.guideline_review.fact_repair_applied ? 'Applied' : 'Not needed'}
                          </div>
                        )}
                        {result.guideline_review.quality_scores && (
                          <div className="u2b-guideline-text">
                            Overall: {result.guideline_review.quality_scores.overall}/10 | Guideline:{' '}
                            {result.guideline_review.quality_scores.guideline_coverage}/10 | Informative:{' '}
                            {result.guideline_review.quality_scores.informativeness}/10 | Originality:{' '}
                            {result.guideline_review.quality_scores.originality}/10
                          </div>
                        )}
                        <div className="u2b-guideline-text">
                          Auto second pass: {result.guideline_review.second_pass_applied ? 'Yes' : 'No'}
                          {typeof result.guideline_review.similarity_ngram_overlap === 'number' && (
                            <> | Similarity signal: {result.guideline_review.similarity_ngram_overlap}</>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="u2b-content-section">
                      <h3>Improvements Applied</h3>
                      <div className="u2b-guideline-text">
                        {result.guideline_review.improvements_applied.map((item, index) => (
                          <span key={`${item}-${index}`}>
                            - {item}
                            <br />
                          </span>
                        ))}
                      </div>
                    </div>
                    {result.guideline_review.remaining_gaps.length > 0 && (
                      <div className="u2b-content-section">
                        <h3>Remaining Gaps</h3>
                        <div className="u2b-guideline-text">
                          {result.guideline_review.remaining_gaps.map((item, index) => (
                            <span key={`${item}-${index}`}>
                              - {item}
                              <br />
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="u2b-content-section">
                      <h3>Original Article Snapshot</h3>
                      <div className="u2b-guideline-text">
                        {result.article.original_excerpt || 'No source excerpt available.'}
                      </div>
                    </div>
                    {result.debug && (
                      <div className="u2b-content-section">
                        <h3>Debug Output</h3>
                        <div className="u2b-raw-toggle">
                          <button
                            type="button"
                            className="url2blog-toggle-btn"
                            onClick={() => setShowTrace(!showTrace)}
                          >
                            {showTrace ? 'Hide' : 'Show'} Stage Trace
                          </button>
                        </div>
                        {showTrace && (
                          <>
                            {groupedTrace.length > 0 ? (
                              <div className="u2b-trace-phase-list">
                                {groupedTrace.map((phaseGroup, phaseIndex) => (
                                  <details
                                    key={phaseGroup.phase.key}
                                    className="u2b-trace-phase"
                                    open={phaseIndex === 0}
                                  >
                                    <summary>
                                      {phaseGroup.phase.title} ({phaseGroup.calls.length} call
                                      {phaseGroup.calls.length === 1 ? '' : 's'})
                                    </summary>
                                    <p className="u2b-trace-phase-description">
                                      {phaseGroup.phase.description}
                                    </p>

                                    <div className="u2b-trace-call-list">
                                      {phaseGroup.calls.map(({ entry, index, callLabel }) => {
                                        const status = getTraceStatus(entry)
                                        return (
                                          <details
                                            key={`${entry.stage}-${index}`}
                                            className="u2b-trace-call"
                                          >
                                            <summary>
                                              <span className="u2b-trace-call-title">
                                                Call {index + 1}: {callLabel}
                                              </span>
                                              <span className={`u2b-trace-status u2b-trace-status--${status}`}>
                                                {getTraceStatusLabel(status)}
                                              </span>
                                            </summary>

                                            <div className="u2b-trace-meta">
                                              <span>Stage ID: {entry.stage}</span>
                                              {entry.model_name && <span>Model: {entry.model_name}</span>}
                                              {typeof entry.max_tokens === 'number' && (
                                                <span>Max tokens: {entry.max_tokens}</span>
                                              )}
                                              {typeof entry.temperature === 'number' && (
                                                <span>Temperature: {entry.temperature}</span>
                                              )}
                                            </div>

                                            {entry.error && (
                                              <div className="u2b-trace-error">
                                                <strong>Error:</strong> {entry.error}
                                              </div>
                                            )}

                                            {entry.input !== undefined && (
                                              <details className="u2b-trace-block">
                                                <summary>Input</summary>
                                                <div className="u2b-raw-json">
                                                  <pre>{JSON.stringify(entry.input, null, 2)}</pre>
                                                </div>
                                              </details>
                                            )}

                                            {entry.prompt && (
                                              <details className="u2b-trace-block">
                                                <summary>Prompt</summary>
                                                <div className="u2b-raw-json">
                                                  <pre>{entry.prompt}</pre>
                                                </div>
                                              </details>
                                            )}

                                            {entry.raw_response && (
                                              <details className="u2b-trace-block">
                                                <summary>Raw Response</summary>
                                                <div className="u2b-raw-json">
                                                  <pre>{entry.raw_response}</pre>
                                                </div>
                                              </details>
                                            )}

                                            {entry.parsed !== undefined && (
                                              <details className="u2b-trace-block">
                                                <summary>Parsed</summary>
                                                <div className="u2b-raw-json">
                                                  <pre>{JSON.stringify(entry.parsed, null, 2)}</pre>
                                                </div>
                                              </details>
                                            )}

                                            {entry.output !== undefined && (
                                              <details className="u2b-trace-block">
                                                <summary>Output</summary>
                                                <div className="u2b-raw-json">
                                                  <pre>{JSON.stringify(entry.output, null, 2)}</pre>
                                                </div>
                                              </details>
                                            )}

                                            {entry.grounded_urls && entry.grounded_urls.length > 0 && (
                                              <details className="u2b-trace-block">
                                                <summary>Grounded URLs</summary>
                                                <div className="u2b-raw-json">
                                                  <pre>{JSON.stringify(entry.grounded_urls, null, 2)}</pre>
                                                </div>
                                              </details>
                                            )}
                                          </details>
                                        )
                                      })}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            ) : (
                              <div className="u2b-guideline-text">
                                No stage trace is available for this run.
                              </div>
                            )}
                          </>
                        )}
                        <div className="u2b-raw-toggle">
                          <button
                            type="button"
                            className="url2blog-toggle-btn"
                            onClick={() => setShowRaw(!showRaw)}
                          >
                            {showRaw ? 'Hide' : 'Show'} Full Debug JSON
                          </button>
                        </div>
                        {showRaw && (
                          <div className="u2b-raw-json">
                            <pre>{JSON.stringify(result.debug, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="url2blog-button-row">
                <button type="button" className="url2blog-submit-btn" onClick={handleCopyMarkdown}>
                  Copy Markdown
                </button>
                <Link to="/url2blog/articles" className="url2blog-clear-btn">
                  Saved Articles
                </Link>
                {result.langsmith_trace_url && (
                  <a
                    href={result.langsmith_trace_url}
                    target="_blank"
                    rel="noreferrer"
                    className="url2blog-submit-btn"
                  >
                    View LangSmith Trace
                  </a>
                )}
                {result.run_id && (
                  <Link
                    to={`/url2blog/stage-article?${new URLSearchParams({
                      runId: result.run_id,
                      title: result.improved_article.title || result.article.original_title || 'Untitled',
                      type: result.selected_article_type.name || '',
                    }).toString()}`}
                    className="url2blog-submit-btn payload-action-btn"
                  >
                    <img
                      src={payloadLogoUrl}
                      alt=""
                      aria-hidden="true"
                      className="payload-action-btn-icon"
                    />
                    Stage for Payload
                  </Link>
                )}
                <button type="button" className="url2blog-clear-btn" onClick={handleStartOver}>
                  Start Over
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
