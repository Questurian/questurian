import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  runUrl2BlogPipelineV2,
  type Url2BlogExecutionProfile,
  type Url2BlogModel,
  type Url2BlogPipelineV2Response,
  type Url2BlogStageTrace,
} from './api'
import './styles.css'

type WizardStep = 'input' | 'processing' | 'complete'
type TraceStatus = 'completed' | 'skipped' | 'error'
type TracePhase = {
  key: string
  title: string
  description: string
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
  if (stage === 'guideline_rewrite_initial' || stage === 'rewrite_repair_second_pass') {
    return {
      key: 'phase_5_rewrite',
      title: 'Phase 5: Guideline Rewrite',
      description: 'Produce and optionally repair the rewritten draft.',
    }
  }
  if (stage.startsWith('quality_audit_') || stage === 'quality_audit_initial') {
    return {
      key: 'phase_6_quality',
      title: 'Phase 6: Quality Audits',
      description: 'Evaluate guideline alignment, informativeness, and originality.',
    }
  }
  if (stage.startsWith('fact_coverage_') || stage === 'fact_repair') {
    return {
      key: 'phase_7_fact_retention',
      title: 'Phase 7: Fact Retention',
      description: 'Audit factual coverage and repair missing high-priority facts.',
    }
  }
  if (stage.startsWith('length_expansion')) {
    return {
      key: 'phase_8_length_expansion',
      title: 'Phase 8: Length Expansion',
      description: 'Expand article depth to satisfy minimum length targets.',
    }
  }
  if (stage === 'editorial_augmentation') {
    return {
      key: 'phase_9_editorial_augmentation',
      title: 'Phase 9: Editorial Augmentation',
      description: 'Optionally add editorial components for readability.',
    }
  }
  if (stage === 'finalize_output') {
    return {
      key: 'phase_10_finalize',
      title: 'Phase 10: Finalization',
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
  const [narrativeFocus, setNarrativeFocus] = useState('')
  const [includeDebug, setIncludeDebug] = useState(true)
  const [modelName, setModelName] = useState<Url2BlogModel>('gemini-2.5-flash')
  const [executionProfile, setExecutionProfile] =
    useState<Url2BlogExecutionProfile>('standard')
  const [result, setResult] = useState<Url2BlogPipelineV2Response | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [showTrace, setShowTrace] = useState(false)

  const pipelineMutation = useMutation<Url2BlogPipelineV2Response, Error, void>({
    mutationFn: async () => {
      return runUrl2BlogPipelineV2({
        url: url.trim(),
        include_debug: includeDebug,
        narrative_focus: narrativeFocus.trim() || undefined,
        model_name: modelName,
        execution_profile: executionProfile,
      })
    },
    onSuccess: (data) => {
      setResult(data)
    },
  })

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
    if (!url.trim()) return

    setResult(null)
    setShowDetails(false)
    setShowRaw(false)
    setShowTrace(false)
    pipelineMutation.reset()
    pipelineMutation.mutate()
  }

  const handleStartOver = () => {
    setUrl('')
    setNarrativeFocus('')
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
                  type="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="url2blog-url-field"
                  autoFocus
                />
              </div>
              <div className="url2blog-url-input">
                <label htmlFor="narrative-focus">Narrative / Audience Focus (Optional)</label>
                <input
                  id="narrative-focus"
                  type="text"
                  placeholder="Example: Reframe for travelers planning where to eat and book."
                  value={narrativeFocus}
                  onChange={(event) => setNarrativeFocus(event.target.value)}
                  className="url2blog-url-field"
                />
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
                  {pipelineMutation.error instanceof Error
                    ? pipelineMutation.error.message
                    : 'Pipeline failed. Check backend logs.'}
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
                <div className="u2b-stage-checklist">
                  <div className="u2b-stage-item done">
                    <div className="u2b-stage-dot" />
                    <span>URL submitted</span>
                  </div>
                  <div className="u2b-stage-item running">
                    <div className="u2b-stage-dot" />
                    <span>Stage 1: Extract article</span>
                  </div>
                  <div className="u2b-stage-item running">
                    <div className="u2b-stage-dot" />
                    <span>Stage 2: Classify article type</span>
                  </div>
                  <div className="u2b-stage-item running">
                    <div className="u2b-stage-dot" />
                    <span>Rewrite to match guideline</span>
                  </div>
                </div>
              </div>
              <p className="u2b-processing-message">Running simplified URL2Blog pipeline...</p>
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
