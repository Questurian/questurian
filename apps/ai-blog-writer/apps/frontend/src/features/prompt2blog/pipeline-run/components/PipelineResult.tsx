import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import type { Prompt2BlogPipelinePayload } from '../../api'
import { RunCostReceipt } from './RunCostReceipt'

interface PipelineResultProps {
  debugData: Record<string, unknown> | null
  result: Prompt2BlogPipelinePayload
  showDebug: boolean
  stageArticleUrl: string | null
  onToggleDebug: () => void
}

export function PipelineResult(props: PipelineResultProps) {
  return <div className="p2b-final-result">
    <h3>Final Article Ready</h3>
    <div className="p2b-panel-actions" style={{ marginBottom: '1rem' }}>
      {props.stageArticleUrl && <Link to={props.stageArticleUrl} className="p2b-synthesize-btn payload-action-btn"><img src={payloadLogoUrl} alt="" aria-hidden="true" className="payload-action-btn-icon" />Stage in Payload Editor</Link>}
      {props.result.langsmith_trace_url && <a href={props.result.langsmith_trace_url} target="_blank" rel="noreferrer" className="p2b-synthesize-btn">View LangSmith Trace</a>}
      <Link to="/prompt2blog/articles" className="p2b-rerun-btn">View Saved Articles</Link>
    </div>
    {props.result.run_cost && <RunCostReceipt cost={props.result.run_cost} />}
    <p><strong>Status:</strong> {props.result.pipeline_status}</p>
    {props.result.readiness_blockers && props.result.readiness_blockers.length > 0 && <p><strong>Held back by:</strong> {props.result.readiness_blockers.join(', ')}</p>}
    <p><strong>Article Type:</strong> {props.result.article_type.name}</p>
    <p><strong>Model Used:</strong> {props.result.quality_review.model_used}</p>
    <p><strong>Title:</strong> {props.result.improved_article.title}</p>
    <p><strong>Quality Summary:</strong> {props.result.quality_review.quality_summary}</p>
    <div className="p2b-synthesized-text">{props.result.final_markdown.split('\n').map((line, index) => <p key={index}>{line || '\u00A0'}</p>)}</div>
    {props.debugData && <div className="p2b-final-debug">
      <button type="button" className="p2b-rerun-btn" onClick={props.onToggleDebug}>{props.showDebug ? 'Hide' : 'Show'} Pipeline Debug</button>
      {props.showDebug && <div className="p2b-raw-json"><pre>{JSON.stringify(props.debugData, null, 2)}</pre></div>}
    </div>}
  </div>
}
