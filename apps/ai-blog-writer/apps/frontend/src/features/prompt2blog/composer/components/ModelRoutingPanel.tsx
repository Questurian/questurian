import {
  PROMPT2BLOG_MODEL_STACKS,
  PROMPT2BLOG_STACK_FAMILY_LABELS,
  PROMPT2BLOG_STACK_FAMILY_ORDER,
  resolvePrompt2BlogModelStack,
  type Prompt2BlogModelStackId,
} from '../../constants/prompt2blog.constants'
import {
  estimatePrompt2BlogStackPrice,
  formatPerMillionRate,
  isPlanAllowanceModel,
  PROMPT2BLOG_ROLE_LABELS,
} from '../../constants/prompt2blog-pricing'
import { Panel } from './Panel'

interface ModelRoutingPanelProps {
  modelStackId: Prompt2BlogModelStackId
  onChange: (modelStackId: Prompt2BlogModelStackId) => void
  onClear: () => void
}

export function ModelRoutingPanel(props: ModelRoutingPanelProps) {
  const selectedStack = resolvePrompt2BlogModelStack(props.modelStackId)
  const priceEstimate = estimatePrompt2BlogStackPrice(selectedStack)
  const planRoleNames = priceEstimate.planRoles
    .map(role => PROMPT2BLOG_ROLE_LABELS[role])
    .join(' and ')

  return <Panel
    title="Run Stack"
    description="Select one option. Within each group, quality-first appears first and fastest appears last."
    onClear={props.onClear}
  >
    <div className="p2b-field p2b-stack-picker">
      <label htmlFor="p2b-run-stack">Pipeline preset</label>
      <select
        id="p2b-run-stack"
        className="p2b-select"
        value={selectedStack.id}
        onChange={event => props.onChange(event.target.value as Prompt2BlogModelStackId)}
      >
        {PROMPT2BLOG_STACK_FAMILY_ORDER.map(family => {
          const stacks = PROMPT2BLOG_MODEL_STACKS.filter(
            stack => stack.family === family,
          )
          if (stacks.length === 0) return null
          return <optgroup key={family} label={PROMPT2BLOG_STACK_FAMILY_LABELS[family]}>
            {stacks.map(stack => (
              <option key={stack.id} value={stack.id}>
                {stack.priceTier} · {stack.label}
                {stack.label === stack.speedTier ? '' : ` · ${stack.speedTier}`}
              </option>
            ))}
          </optgroup>
        })}
      </select>
      <p className="p2b-stack-description">{selectedStack.description}</p>
    </div>
    <div
      className="p2b-stack-cost"
      aria-label={`${selectedStack.label} estimated pricing`}
      aria-live="polite"
    >
      {priceEstimate.mixedPerMillion === null ? (
        <div className="p2b-stack-cost-headline p2b-stack-cost-headline--plan">
          <strong>Included in your Claude plan</strong>
          <span>no per-token rate</span>
        </div>
      ) : (
        <div className="p2b-stack-cost-headline">
          <span>{planRoleNames ? 'Metered part' : 'Estimated blended rate'}</span>
          <strong>{formatPerMillionRate(priceEstimate.mixedPerMillion)}</strong>
          <span>per 1M mixed tokens</span>
        </div>
      )}
      {planRoleNames ? (
        <p className="p2b-stack-cost-plan">
          {planRoleNames} runs on your Claude plan, so it draws plan usage
          instead of billing per token. The rate above covers the rest.
        </p>
      ) : null}
      <div className="p2b-stack-cost-breakdown">
        <span>Input {formatPerMillionRate(priceEstimate.inputPerMillion)} / 1M</span>
        <span>Output {formatPerMillionRate(priceEstimate.outputPerMillion)} / 1M</span>
        <span>Expected speed {selectedStack.speedTier}</span>
      </div>
      <details className="p2b-stack-cost-method">
        <summary>How this estimate works</summary>
        <p>
          Comparison estimate: 80% input and 20% output tokens, weighted across
          4 worker, 5 writer, and 2 judge responsibilities. Actual cost changes
          with source length, retries, caching, and optional stages.
        </p>
        <p>
          Standard global Vertex rates checked August 24, 2026. Gemini 3.7 Flash
          introductory pricing ends December 31, 2026.
        </p>
        <p>
          Claude roles are left out of the rate rather than given an invented
          one. Subscription calls draw your plan's allowance, so there is no
          dollar-per-million figure to quote. What a run actually used shows on
          the finished article's cost receipt.
        </p>
      </details>
    </div>
    <details className="p2b-stack-details">
      <summary>See model assignments</summary>
      <div className="p2b-stack-receipt" aria-label={`${selectedStack.label} model assignments`}>
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.modelName}
          model={selectedStack.modelName}
          stages="Cleanup · synthesis · coverage · gap filling"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.writingModel}
          model={selectedStack.writingModel}
          stages="Outline · draft · repair · extras · title"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.auditModel}
          model={selectedStack.auditModel}
          stages="Groundedness · quality audit"
        />
      </div>
    </details>
  </Panel>
}

function StackAssignment({
  label,
  model,
  stages,
}: {
  label: string
  model: string
  stages: string
}) {
  return <div className="p2b-stack-assignment">
    <span className="p2b-stack-assignment-label">{label}</span>
    <strong>{formatModelName(model)}</strong>
    <span className="p2b-stack-assignment-stages">{stages}</span>
  </div>
}

function formatModelName(model: string): string {
  if (isPlanAllowanceModel(model)) {
    return model
      .replace('claude-', 'Claude ')
      .replace(/-/g, ' ')
      .replace(' opus', ' Opus')
      .replace(' sonnet', ' Sonnet')
      .replace(' haiku', ' Haiku')
  }
  return model
    .replace('gemini-', 'Gemini ')
    .replace(/-/g, ' ')
    .replace(' preview', ' Preview')
    .replace(' pro', ' Pro')
    .replace(' flash', ' Flash')
    .replace(' lite', ' Lite')
}
