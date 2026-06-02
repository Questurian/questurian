import { useQuery, type QueryKey } from '@tanstack/react-query'

export type PipelineRunStatus = {
  state: string
}

export type UsePipelineRunPollOptions<TStatus extends PipelineRunStatus> = {
  queryKey: QueryKey
  runId: string | null
  fetchStatus: (runId: string) => Promise<TStatus>
  enabled?: boolean
  pollIntervalMs?: number
  errorPollIntervalMs?: number
  terminalStates?: readonly string[]
  shouldContinuePolling?: (status: TStatus | null) => boolean
}

export function usePipelineRunPoll<TStatus extends PipelineRunStatus>({
  queryKey,
  runId,
  fetchStatus,
  enabled = Boolean(runId),
  pollIntervalMs = 1200,
  errorPollIntervalMs = pollIntervalMs,
  terminalStates = ['completed', 'failed'],
  shouldContinuePolling,
}: UsePipelineRunPollOptions<TStatus>) {
  return useQuery({
    queryKey,
    queryFn: () => fetchStatus(runId as string),
    enabled: Boolean(enabled && runId),
    retry: false,
    refetchInterval: (query) => {
      const current = (query.state.data ?? null) as TStatus | null
      if (shouldContinuePolling && !shouldContinuePolling(current)) return false
      if (current && terminalStates.includes(current.state)) return false
      if (query.state.error) return errorPollIntervalMs
      return pollIntervalMs
    },
  })
}
