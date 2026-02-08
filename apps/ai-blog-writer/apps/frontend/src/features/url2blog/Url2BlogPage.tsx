import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  runUrl2BlogPipelineV2,
  type Url2BlogExecutionProfile,
  type Url2BlogModel,
  type Url2BlogPipelineV2Response,
} from './api'
import './styles.css'

type WizardStep = 'input' | 'processing' | 'complete'

export default function Url2BlogPage() {
  const [url, setUrl] = useState('')
  const [narrativeFocus, setNarrativeFocus] = useState('')
  const [modelName, setModelName] = useState<Url2BlogModel>('gemini-2.5-flash')
  const [executionProfile, setExecutionProfile] =
    useState<Url2BlogExecutionProfile>('standard')
  const [result, setResult] = useState<Url2BlogPipelineV2Response | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const pipelineMutation = useMutation<Url2BlogPipelineV2Response, Error, void>({
    mutationFn: async () => {
      return runUrl2BlogPipelineV2({
        url: url.trim(),
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!url.trim()) return

    setResult(null)
    setShowDetails(false)
    setShowRaw(false)
    pipelineMutation.reset()
    pipelineMutation.mutate()
  }

  const handleStartOver = () => {
    setUrl('')
    setNarrativeFocus('')
    setModelName('gemini-2.5-flash')
    setExecutionProfile('standard')
    setResult(null)
    setShowDetails(false)
    setShowRaw(false)
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
                        <h3>Debug Output JSON</h3>
                        <div className="u2b-raw-toggle">
                          <button
                            type="button"
                            className="url2blog-toggle-btn"
                            onClick={() => setShowRaw(!showRaw)}
                          >
                            {showRaw ? 'Hide' : 'Show'} Debug JSON
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
