export type PipelineRunProgressStatus = {
  state?: string | null
  stage?: string | null
}

export type PipelineStepState = 'pending' | 'running' | 'done' | 'failed'

const DEFAULT_PIPELINE_STATES = ['pending', 'running', 'completed', 'failed'] as const

type NormalizePipelineStatusOptions<
  TStage extends string,
  TState extends string,
  TStatus extends Record<string, unknown>,
> = {
  value: unknown
  stages: readonly TStage[]
  states?: readonly TState[]
  defaults: TStatus & {
    stage: TStage
    state: TState
  }
}

type GetStepStatusOptions = {
  step: string
  status: PipelineRunProgressStatus | null | undefined
  stageOrder: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveMember<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  fallback: TValue,
): TValue {
  return allowed.includes(value as TValue) ? value as TValue : fallback
}

export function normalizePipelineStatus<
  TStage extends string,
  TState extends string = 'pending' | 'running' | 'completed' | 'failed',
  TStatus extends Record<string, unknown> = Record<string, unknown>,
>({
  value,
  stages,
  states,
  defaults,
}: NormalizePipelineStatusOptions<TStage, TState, TStatus>): TStatus & {
  stage: TStage
  state: TState
} {
  const record = isRecord(value) ? value : {}
  const allowedStates = states ?? (DEFAULT_PIPELINE_STATES as unknown as readonly TState[])

  return {
    ...defaults,
    ...record,
    stage: resolveMember(record.stage, stages, defaults.stage),
    state: resolveMember(record.state, allowedStates, defaults.state),
  }
}

export function getStepStatus({
  step,
  status,
  stageOrder,
}: GetStepStatusOptions): PipelineStepState {
  const activeStage = typeof status?.stage === 'string' ? status.stage : null
  const activeIndex = activeStage ? stageOrder.indexOf(activeStage) : -1
  const stepIndex = stageOrder.indexOf(step)

  if (status?.state === 'completed') return 'done'
  if (stepIndex === -1) return 'pending'
  if (status?.state === 'failed') {
    if (activeStage === step) return 'failed'
    return activeIndex > stepIndex ? 'done' : 'pending'
  }
  if (activeIndex === -1) return 'pending'
  if (activeIndex > stepIndex) return 'done'
  if (activeIndex === stepIndex) return 'running'
  return 'pending'
}
