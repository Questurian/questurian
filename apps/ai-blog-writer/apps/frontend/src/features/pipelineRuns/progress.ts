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
  unknownStage?: TStage | ((rawStage: string) => TStage)
  rawStageField?: string
  defaults: TStatus & {
    stage: TStage
    state: TState
  }
}

type GetStepStatusOptions = {
  step: string
  status: PipelineRunProgressStatus | null | undefined
  stageOrder: readonly string[]
  optional?: boolean
}

type FinalizeStatusResponseOptions = {
  fallbackRunId: string
  feature?: string
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

function resolveUnknownStage<TStage extends string>(
  rawStage: string | null,
  unknownStage: NormalizePipelineStatusOptions<TStage, string, Record<string, unknown>>['unknownStage'],
  fallback: TStage,
): TStage {
  if (!rawStage || !unknownStage) return fallback
  return typeof unknownStage === 'function' ? unknownStage(rawStage) : unknownStage
}

export function normalizePipelineStatus<
  TStage extends string,
  TState extends string = 'pending' | 'running' | 'completed' | 'failed',
  TStatus extends Record<string, unknown> = Record<string, unknown>,
>({
  value,
  stages,
  states,
  unknownStage,
  rawStageField,
  defaults,
}: NormalizePipelineStatusOptions<TStage, TState, TStatus>): TStatus & {
  stage: TStage
  state: TState
} {
  const record = isRecord(value) ? value : {}
  const allowedStates = states ?? (DEFAULT_PIPELINE_STATES as unknown as readonly TState[])
  const rawStage = typeof record.stage === 'string' && record.stage.length > 0 ? record.stage : null
  const isKnownStage = rawStage ? stages.includes(rawStage as TStage) : false
  const stage = isKnownStage
    ? rawStage as TStage
    : resolveUnknownStage(rawStage, unknownStage, defaults.stage)

  return {
    ...defaults,
    ...record,
    ...(rawStageField && rawStage && !isKnownStage ? { [rawStageField]: rawStage } : {}),
    stage,
    state: resolveMember(record.state, allowedStates, defaults.state),
  }
}

export function finalizeStatusResponse<
  TStatus extends {
    run_id: string
    updated_at: string
    error?: string | null
    feature?: string
  },
>(
  normalized: TStatus,
  { fallbackRunId, feature }: FinalizeStatusResponseOptions,
): TStatus {
  return {
    ...normalized,
    run_id: typeof normalized.run_id === 'string' ? normalized.run_id : fallbackRunId,
    updated_at: typeof normalized.updated_at === 'string' ? normalized.updated_at : '',
    error: typeof normalized.error === 'string' ? normalized.error : null,
    ...(feature ? { feature: typeof normalized.feature === 'string' ? normalized.feature : feature } : {}),
  }
}

export function getStepStatus({
  step,
  status,
  stageOrder,
  optional = false,
}: GetStepStatusOptions): PipelineStepState {
  const activeStage = typeof status?.stage === 'string' ? status.stage : null
  const activeIndex = activeStage ? stageOrder.indexOf(activeStage) : -1
  const stepIndex = stageOrder.indexOf(step)

  if (optional) {
    if (activeStage !== step) return 'pending'
    if (status?.state === 'failed') return 'failed'
    if (status?.state === 'running') return 'running'
    return 'pending'
  }

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
