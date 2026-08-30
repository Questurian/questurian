import {
  DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  type Prompt2BlogModelStackId,
  PROMPT2BLOG_ROUTE_GROUPS,
  resolvePrompt2BlogModelStack,
} from '../../constants/prompt2blog.constants'
import {
  estimatePrompt2BlogStackPrice,
  formatPerMillionRate,
  isPlanAllowanceModel,
  PROMPT2BLOG_ROLE_LABELS,
} from '../../constants/prompt2blog-pricing'
import { Panel } from './Panel'

export function ModelRoutingPanel({
  modelStackId = DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  onChange,
}: {
  modelStackId?: Prompt2BlogModelStackId
  /** Omitted on a read-only render; the panel then shows the route in use. */
  onChange?: (value: Prompt2BlogModelStackId) => void
} = {}) {
  const selectedStack = resolvePrompt2BlogModelStack(modelStackId)
  const priceEstimate = estimatePrompt2BlogStackPrice(selectedStack)
  const planRoleNames = priceEstimate.planRoles
    .map(role => PROMPT2BLOG_ROLE_LABELS[role])
    .join(' and ')

  return <Panel
    title="Article system"
    description="Who writes the draft, and who checks it. Both routes write on Claude Opus."
  >
    <div className="p2b-field p2b-stack-picker">
      {onChange ? (
        <>
          <label htmlFor="p2b-model-stack">Article route</label>
          <select
            id="p2b-model-stack"
            className="p2b-select"
            value={selectedStack.id}
            onChange={event =>
              onChange(event.target.value as Prompt2BlogModelStackId)
            }
          >
            {PROMPT2BLOG_ROUTE_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.ids.map(id => {
                  const stack = resolvePrompt2BlogModelStack(id)
                  return <option key={id} value={id}>{stack.shortLabel}</option>
                })}
              </optgroup>
            ))}
          </select>
        </>
      ) : (
        <strong>{selectedStack.label}</strong>
      )}
      <p className="p2b-stack-description">{selectedStack.description}</p>
      <p className="p2b-stack-guidance">{selectedStack.guidance}</p>
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
          Comparison estimate: 80% input and 20% output tokens, weighted by the
          share of a run each role actually spent — 41% writer, 22% judge, 22%
          fact checker, 9% planner, 7% headline, measured on a finished run.
          Actual cost changes with source length, repairs, and caching.
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
          label={PROMPT2BLOG_ROLE_LABELS.writingModel}
          model={selectedStack.writingModel}
          stages="First draft"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.repairModel}
          model={selectedStack.repairModel}
          stages="Rewrite of a draft that failed the audit"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.auditModel}
          model={selectedStack.auditModel}
          stages="Quality audit"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.groundednessModel}
          model={selectedStack.groundednessModel}
          stages="Claims checked against the evidence"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.outlineModel}
          model={selectedStack.outlineModel}
          stages="Section plan"
        />
        <StackAssignment
          label={PROMPT2BLOG_ROLE_LABELS.titleModel}
          model={selectedStack.titleModel}
          stages="Headline"
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
