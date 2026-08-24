import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchClaudeStatus, startClaudeLogin } from './api/claude-connection.api'
import type { ClaudeConnectionStatus } from './claude-connection.types'

export const CLAUDE_STATUS_QUERY_KEY = ['claude', 'connection-status'] as const

/**
 * How often the nav light re-reads the backend.
 *
 * Every poll shells out to the Claude CLI on the host, so this is minutes, not
 * seconds. An OAuth session lapsing is a days-scale event; there is nothing to
 * gain from noticing it thirty seconds sooner, and a fast poll would spawn a
 * subprocess on every tick for the life of the tab.
 */
export const CLAUDE_STATUS_POLL_MS = 5 * 60 * 1000
const CLAUDE_STATUS_ERROR_POLL_MS = 60 * 1000

export type UseClaudeStatusResult = {
  status: ClaudeConnectionStatus | null
  error: Error | null
  isLoading: boolean
  isRefreshing: boolean
  refresh: () => void
  startLogin: () => void
  isStartingLogin: boolean
  loginError: Error | null
  loginStartedCommand: string | null
}

/**
 * The Claude connection light's own source of truth.
 *
 * Deliberately not part of `useAuth`. That hook's `isConnected` means "Payload
 * is reachable", and the two answers are independent: Payload can be up while
 * the Claude login has lapsed, and the reverse. Welding a second boolean onto
 * auth state would make one outage look like the other.
 */
export function useClaudeStatus(): UseClaudeStatusResult {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CLAUDE_STATUS_QUERY_KEY,
    queryFn: fetchClaudeStatus,
    retry: false,
    refetchInterval: (current) =>
      current.state.error ? CLAUDE_STATUS_ERROR_POLL_MS : CLAUDE_STATUS_POLL_MS,
  })

  const login = useMutation({
    mutationFn: startClaudeLogin,
    // The sign-in finishes in a terminal the app cannot observe, so the
    // immediate re-read is only to clear a stale red; the poll picks up the
    // real change, and the page offers a manual re-check.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAUDE_STATUS_QUERY_KEY })
    },
  })

  return {
    status: query.data ?? null,
    error: (query.error as Error | null) ?? null,
    isLoading: query.isPending,
    isRefreshing: query.isFetching && !query.isPending,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: CLAUDE_STATUS_QUERY_KEY })
    },
    startLogin: () => login.mutate(),
    isStartingLogin: login.isPending,
    loginError: (login.error as Error | null) ?? null,
    loginStartedCommand: login.data?.command ?? null,
  }
}
