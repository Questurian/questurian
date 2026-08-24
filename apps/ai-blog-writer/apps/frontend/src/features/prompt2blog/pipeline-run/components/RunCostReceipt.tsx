import { PROMPT2BLOG_MODEL_STACKS } from '../../constants/prompt2blog.constants'
import type { Prompt2BlogPipelinePayload } from '../../types/pipeline.types'

type RunCost = NonNullable<Prompt2BlogPipelinePayload['run_cost']>

export function RunCostReceipt({ cost }: { cost: RunCost }) {
  const stack = PROMPT2BLOG_MODEL_STACKS.find(option => option.id === cost.stack_id)
  const coverageLabel = cost.measurement_status === 'complete'
    ? `Measured from all ${cost.measured_calls} successful model calls.`
    : cost.measurement_status === 'partial'
      ? `Partial estimate: ${cost.measured_calls} of ${cost.successful_calls} successful calls reported usage.`
      : 'Model APIs did not return token usage for this run.'

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
      <RunMetric label="Cached input" value={formatTokens(cost.cached_input_tokens)} />
    </div>
    <p className="p2b-run-cost__coverage">{coverageLabel}</p>
    <details className="p2b-run-cost__details">
      <summary>Price and model breakdown</summary>
      <div className="p2b-run-cost__models">
        {cost.by_model.map(model => <div key={model.model}>
          <strong>{formatModelName(model.model)}</strong>
          <span>{formatTokens(model.total_tokens)} tokens</span>
          <span>{model.calls} {model.calls === 1 ? 'call' : 'calls'}</span>
          <span>{formatUsd(model.estimated_cost_usd)}</span>
        </div>)}
      </div>
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

function formatModelName(model: string): string {
  return model
    .replace('gemini-', 'Gemini ')
    .replace(/-/g, ' ')
    .replace(' preview', ' Preview')
    .replace(' pro', ' Pro')
    .replace(' flash', ' Flash')
    .replace(' lite', ' Lite')
}
