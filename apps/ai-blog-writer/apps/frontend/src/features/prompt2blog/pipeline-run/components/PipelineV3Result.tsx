import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import type { Prompt2BlogV3PipelinePayload } from '../../api'
import { researchStatusLabel } from '../../composer/research-language'
import { RunCostReceipt } from './RunCostReceipt'

interface PipelineV3ResultProps {
  debugData: Record<string, unknown> | null
  result: Prompt2BlogV3PipelinePayload
  showDebug: boolean
  stageArticleUrl: string | null
  onToggleDebug: () => void
}

/**
 * The v3 result. It reports the commission the article answers and the
 * evidence it was written from, because that is what makes a finished v3 run
 * auditable without replaying it or trusting the prose.
 */
export function PipelineV3Result({
  debugData,
  result,
  showDebug,
  stageArticleUrl,
  onToggleDebug,
}: PipelineV3ResultProps) {
  const requirementStatus = result.evidence_receipt?.requirement_status ?? {}
  const requirementIds = Object.keys(requirementStatus)

  return (
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
        {result.langsmith_trace_url && (
          <a
            href={result.langsmith_trace_url}
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
      {result.run_cost && <RunCostReceipt cost={result.run_cost} />}
      <p>
        <strong>Status:</strong> {result.pipeline_status}
      </p>
      {result.readiness_blockers.length > 0 && (
        <p>
          <strong>Held back by:</strong> {result.readiness_blockers.join(', ')}
        </p>
      )}
      <p>
        <strong>Article Form:</strong> {result.form.label || result.form.id || 'Unknown'}
      </p>
      <p>
        <strong>Commission:</strong> {result.commission.approved_direction}
      </p>
      <p>
        <strong>Primary Subject:</strong> {result.commission.primary_subject}
      </p>
      <p>
        <strong>Model Used:</strong> {result.quality_review.model_used}
      </p>
      <p>
        <strong>Title:</strong> {result.improved_article.title}
      </p>
      <p>
        <strong>Original Title:</strong> {result.commission.original_title}
      </p>
      <p>
        <strong>Quality Summary:</strong> {result.quality_review.quality_summary}
      </p>
      {requirementIds.length > 0 && (
        <div className="p2b-import-report">
          <p className="p2b-import-report-title">
            {result.evidence_receipt.source_ids?.length ?? 0} sources and{' '}
            {result.evidence_receipt.claim_ids?.length ?? 0} claims backed this article.
          </p>
          <ul className="p2b-requirement-list">
            {requirementIds.map(requirementId => (
              <li key={requirementId} className="p2b-requirement-row">
                <code>{requirementId}</code>{' '}
                {researchStatusLabel(requirementStatus[requirementId])}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="p2b-synthesized-text">
        {result.final_markdown.split('\n').map((line, index) => (
          <p key={index}>{line || ' '}</p>
        ))}
      </div>
      {debugData && (
        <div className="p2b-final-debug">
          <button type="button" className="p2b-rerun-btn" onClick={onToggleDebug}>
            {showDebug ? 'Hide' : 'Show'} Pipeline Debug
          </button>
          {showDebug && (
            <div className="p2b-raw-json">
              <pre>{JSON.stringify(debugData, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
