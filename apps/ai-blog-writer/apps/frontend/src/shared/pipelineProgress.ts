export type PipelineProgressState = 'pending' | 'running' | 'done' | 'failed'

type PipelineProgressStatus = {
  state?: string | null
  stage?: string | null
}

type PipelineProgressOptions<TDone extends string, TRunning extends string, TPending extends string, TFailed extends string> = {
  step: string
  status: PipelineProgressStatus | null | undefined
  stageOrder: readonly string[]
  doneState: TDone
  runningState: TRunning
  pendingState: TPending
  failedState: TFailed
}

export function getPipelineProgressState<
  TDone extends string = 'done',
  TRunning extends string = 'running',
  TPending extends string = 'pending',
  TFailed extends string = 'failed',
>({
  step,
  status,
  stageOrder,
  doneState,
  runningState,
  pendingState,
  failedState,
}: PipelineProgressOptions<TDone, TRunning, TPending, TFailed>): TDone | TRunning | TPending | TFailed {
  const activeStage = typeof status?.stage === 'string' ? status.stage : null
  const activeIndex = activeStage ? stageOrder.indexOf(activeStage) : -1
  const stepIndex = stageOrder.indexOf(step)

  if (status?.state === 'completed') return doneState
  if (stepIndex === -1) return pendingState
  if (status?.state === 'failed') {
    if (activeStage === step) return failedState
    return activeIndex > stepIndex ? doneState : pendingState
  }
  if (activeIndex === -1) return pendingState
  if (activeIndex > stepIndex) return doneState
  if (activeIndex === stepIndex) return runningState
  return pendingState
}
