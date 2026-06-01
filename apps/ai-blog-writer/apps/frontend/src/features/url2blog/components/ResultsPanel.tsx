import { useState } from 'react'
import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../../assets/payload-logo.svg?url'
import type { Url2BlogPipelineV2Response } from '../types/pipeline.types'
import { DebugOutput } from './debug/DebugOutput'

type ResultsPanelProps = {
  result: Url2BlogPipelineV2Response
  onStartOver: () => void
}

export function ResultsPanel({ result, onStartOver }: ResultsPanelProps) {
  const [showDetails, setShowDetails] = useState(false)
  const title = result.improved_article.title || result.article.original_title || 'Improved Article'

  return (
    <section className="url2blog-panel u2b-wizard-panel u2b-complete-panel">
      <div className="url2blog-panel-header">
        <div className="u2b-step-indicator u2b-complete-indicator">
          <span className="u2b-step-check">&check;</span><span>Pipeline Complete</span>
        </div>
        <h2>{title}</h2>
        <p className="u2b-source-url">{result.article.source_url || 'Pasted text input'}</p>
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
            <div className="u2b-raw-json"><pre>{result.final_markdown}</pre></div>
          </div>
          <div className="u2b-content-section">
            <div className="u2b-raw-toggle">
              <button type="button" className="url2blog-toggle-btn" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? 'Hide' : 'Show'} Details
              </button>
            </div>
          </div>
          {showDetails && <ResultDetails result={result} />}
        </div>
        <div className="url2blog-button-row">
          <button type="button" className="url2blog-submit-btn" onClick={() => navigator.clipboard.writeText(result.final_markdown)}>Copy Markdown</button>
          <Link to="/url2blog/articles" className="url2blog-clear-btn">Saved Articles</Link>
          {result.langsmith_trace_url && <a href={result.langsmith_trace_url} target="_blank" rel="noreferrer" className="url2blog-submit-btn">View LangSmith Trace</a>}
          {result.run_id && (
            <Link to={`/url2blog/stage-article?${new URLSearchParams({ runId: result.run_id, title, type: result.selected_article_type.name || '' }).toString()}`}
              className="url2blog-submit-btn payload-action-btn">
              <img src={payloadLogoUrl} alt="" aria-hidden="true" className="payload-action-btn-icon" />Stage for Payload
            </Link>
          )}
          <button type="button" className="url2blog-clear-btn" onClick={onStartOver}>Start Over</button>
        </div>
      </div>
    </section>
  )
}

function ResultDetails({ result }: { result: Url2BlogPipelineV2Response }) {
  const review = result.guideline_review
  return (
    <>
      <div className="u2b-content-section">
        <h3>Guideline Alignment Summary</h3>
        <div className="u2b-guideline-text">{review.alignment_summary}</div>
      </div>
      {review.quality_summary && <QualityAudit result={result} />}
      <div className="u2b-content-section">
        <h3>Improvements Applied</h3>
        <ItemList items={review.improvements_applied} />
      </div>
      {review.remaining_gaps.length > 0 && (
        <div className="u2b-content-section">
          <h3>Remaining Gaps</h3>
          <ItemList items={review.remaining_gaps} />
        </div>
      )}
      <div className="u2b-content-section">
        <h3>Original Article Snapshot</h3>
        <div className="u2b-guideline-text">{result.article.original_excerpt || 'No source excerpt available.'}</div>
      </div>
      {result.debug && <DebugOutput debug={result.debug} />}
    </>
  )
}

function ItemList({ items }: { items: string[] }) {
  return <div className="u2b-guideline-text">{items.map((item, index) => <span key={`${item}-${index}`}>- {item}<br /></span>)}</div>
}

function QualityAudit({ result }: { result: Url2BlogPipelineV2Response }) {
  const review = result.guideline_review
  return (
    <div className="u2b-content-section">
      <h3>Quality Audit</h3>
      <div className="u2b-guideline-text">{review.quality_summary}</div>
      {review.narrative_focus_applied && <div className="u2b-guideline-text">Narrative focus applied: {review.narrative_focus_applied}</div>}
      {review.model_used && <div className="u2b-guideline-text">Model used: {review.model_used}</div>}
      {review.execution_profile && <div className="u2b-guideline-text">Execution profile: {review.execution_profile}</div>}
      {typeof review.source_word_count === 'number' && <div className="u2b-guideline-text">Source length: ~{review.source_word_count} words</div>}
      {result.pipeline_status === 'needs_revision' && review.length_requirement_blocking_reason && <div className="u2b-guideline-text">Drafting gate: {review.length_requirement_blocking_reason}</div>}
      {typeof review.short_article_enrichment_applied === 'boolean' && (
        <div className="u2b-guideline-text">Google-grounded enrichment: {review.short_article_enrichment_applied ? 'Applied' : 'Not needed'}
          {typeof review.external_context_points_used === 'number' && <> ({review.external_context_points_used} context points)</>}
        </div>
      )}
      {review.external_context_usage_note && <div className="u2b-guideline-text">{review.external_context_usage_note}</div>}
      {typeof review.factual_coverage_score === 'number' && (
        <div className="u2b-guideline-text">Factual coverage: {review.factual_coverage_score}/10
          {typeof review.missing_source_facts_count === 'number' && <> | Missing source facts: {review.missing_source_facts_count}</>}
          {typeof review.missing_high_priority_facts_count === 'number' && <> | Missing high-priority facts: {review.missing_high_priority_facts_count}</>}
        </div>
      )}
      {review.factual_coverage_summary && <div className="u2b-guideline-text">{review.factual_coverage_summary}</div>}
      {typeof review.fact_repair_applied === 'boolean' && <div className="u2b-guideline-text">Fact repair pass: {review.fact_repair_applied ? 'Applied' : 'Not needed'}</div>}
      {review.quality_scores && <div className="u2b-guideline-text">
        Overall: {review.quality_scores.overall}/10 | Guideline: {review.quality_scores.guideline_coverage}/10 | Informative: {review.quality_scores.informativeness}/10 | Originality: {review.quality_scores.originality}/10
      </div>}
      <div className="u2b-guideline-text">Auto second pass: {review.second_pass_applied ? 'Yes' : 'No'}
        {typeof review.similarity_ngram_overlap === 'number' && <> | Similarity signal: {review.similarity_ngram_overlap}</>}
      </div>
    </div>
  )
}
