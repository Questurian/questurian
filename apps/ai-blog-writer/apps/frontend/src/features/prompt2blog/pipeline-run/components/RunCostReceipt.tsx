import { PROMPT2BLOG_MODEL_STACKS } from '../../constants/prompt2blog.constants'
import type {
  Prompt2BlogPipelinePayload,
  Prompt2BlogPipelineStage,
} from '../../types/pipeline.types'
import { PIPELINE_STAGE_LABELS } from '../pipeline-status'

type RunCost = NonNullable<Prompt2BlogPipelinePayload['run_cost']>

export function RunCostReceipt({ cost }: { cost: RunCost }) {
  const stack = PROMPT2BLOG_MODEL_STACKS.find(option => option.id === cost.stack_id)
  const coverageLabel = cost.measurement_status === 'complete'
    ? `Measured from all ${cost.measured_calls} successful model calls.`
    : cost.measurement_status === 'partial'
      ? `Partial estimate: ${cost.measured_calls} of ${cost.successful_calls} successful calls reported usage.`
      : 'Model APIs did not return token usage for this run.'
  // Stage rows and the headline total are sums over the same ledger, so they
  // agree. Saying so where the reader can check it is the point: the receipt
  // used to lose a repeated stage's first pass, and nothing on screen showed
  // that anything was missing.
  const attributed = cost.attributed_total_tokens
  const ledgerBalances = attributed == null || attributed === cost.total_tokens

  return <section className="p2b-run-cost" aria-label="Run cost and token usage">
    <div className="p2b-run-cost__header">
      <div>
        <span className="p2b-run-cost__eyebrow">Run receipt</span>
        <h4>{stack?.label || 'Custom stack'}</h4>
      </div>
      <div className="p2b-run-cost__total">
        <span>Estimated run cost</span>
        <strong>{formatUsd(cost.estimated_cost_usd, cost.measurement_status)}</strong>
      </div>
    </div>
    <div className="p2b-run-cost__metrics">
      <RunMetric label="Total tokens" value={formatTokens(cost.total_tokens)} />
      <RunMetric label="Input" value={formatTokens(cost.input_tokens)} />
      <RunMetric label="Output" value={formatTokens(cost.output_tokens)} />
      {cost.reasoning_tokens != null && cost.reasoning_tokens > 0 && <RunMetric label="of which reasoning" value={formatTokens(cost.reasoning_tokens)} />}
      <RunMetric label="Cached input" value={formatTokens(cost.cached_input_tokens)} />
    </div>
    <p className="p2b-run-cost__coverage">{coverageLabel}</p>
    <details className="p2b-run-cost__details">
      <summary>Price and model breakdown</summary>
      <span className="p2b-run-cost__eyebrow">By model</span>
      <div className="p2b-run-cost__models">
        {cost.by_model.map(model => <div key={model.model}>
          <strong>{formatModelName(model.model)}</strong>
          <span>{formatTokens(model.total_tokens)} tokens</span>
          <span>{model.calls} {model.calls === 1 ? 'call' : 'calls'}</span>
          <span>{formatUsd(model.estimated_cost_usd)}</span>
        </div>)}
      </div>
      {cost.by_stage != null && cost.by_stage.length > 0 && <>
        <span className="p2b-run-cost__eyebrow">By stage</span>
        <div className="p2b-run-cost__models">
          {cost.by_stage.map(row => <div key={row.stage}>
            <strong>{formatStageName(row.stage)}</strong>
            <span>{formatTokens(row.total_tokens)} tokens</span>
            <span>{row.calls} {row.calls === 1 ? 'call' : 'calls'}</span>
            <span>{row.attempts != null && row.attempts > 1
              ? `${row.attempts} attempts`
              : `${formatTokens(row.reasoning_tokens)} reasoning`}</span>
          </div>)}
        </div>
      </>}
      {cost.by_attempt != null && cost.by_attempt.length > 0 && <>
        <span className="p2b-run-cost__eyebrow">By attempt</span>
        <div className="p2b-run-cost__models">
          {cost.by_attempt.map(row => <div key={`${row.stage}-${row.attempt}`}>
            <strong>{formatStageName(row.stage)} · attempt {row.attempt}</strong>
            <span>{formatTokens(row.total_tokens)} tokens</span>
            <span>{row.calls} {row.calls === 1 ? 'call' : 'calls'}</span>
            <span>{formatUsd(row.cost_usd)}</span>
          </div>)}
        </div>
      </>}
      {!ledgerBalances && <p>
        Stage rows account for {formatTokens(attributed as number)} of{' '}
        {formatTokens(cost.total_tokens)} tokens.
      </p>}
      {cost.unmetered_calls != null && cost.unmetered_calls > 0 && <p>
        {cost.unmetered_calls} {cost.unmetered_calls === 1 ? 'call' : 'calls'} returned
        no usage figures, so this run's tokens are a floor rather than a total.
      </p>}
      <p>{cost.pricing_note}</p>
      <p>Estimate excludes network, storage, grounding, and other non-token charges.</p>
    </details>
  </section>
}

function RunMetric({ label, value }: { label: string; value: string }) {
  return <div>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatUsd(
  value: number | null,
  measurementStatus: RunCost['measurement_status'] = 'complete',
): string {
  if (value == null) return 'Unavailable'
  const digits = value < 0.01 ? 4 : 2
  return `${measurementStatus === 'partial' ? '≥' : ''}$${value.toFixed(digits)}`
}

function formatStageName(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage as Prompt2BlogPipelineStage]
    || stage.replace(/^stage_/, '').replace(/_/g, ' ')
}

function formatModelName(model: string): string {
  return model
    .replace('gemini-', 'Gemini ')
    .replace(/-/g, ' ')
    .replace(' preview', ' Preview')
    .replace(' pro', ' Pro')
    .replace(' flash', ' Flash')
    .replace(' lite', ' Lite')
}
