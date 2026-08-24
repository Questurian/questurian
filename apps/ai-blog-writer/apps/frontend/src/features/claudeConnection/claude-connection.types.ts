/**
 * What `GET /claude/status` reports about this machine's Claude login.
 *
 * Deliberately carries no token field and never will: the backend copies an
 * allow-list of fields out of `claude auth status`, so there is nothing here
 * for the browser to hold.
 */
export type ClaudeConnectionState =
  | 'connected'
  | 'not_logged_in'
  | 'login_expired'
  | 'api_billed_override'
  | 'console_account'
  | 'cli_missing'
  | 'error'

export type ClaudeConnectionStatus = {
  state: ClaudeConnectionState
  connected: boolean
  /** Short text for the nav pill, e.g. "Claude Pro". */
  label: string
  /** Sentence explaining a non-green state. Null when connected. */
  detail: string | null
  loggedIn: boolean | null
  authMethod: string | null
  apiProvider: string | null
  subscriptionType: string | null
  email: string | null
  orgName: string | null
  usesSubscription: boolean
  /**
   * Days until the OAuth session lapses, when the CLI names an expiry.
   * Claude Code does not report one today, so this is normally null.
   */
  expiresInDays: number | null
  /** Names only -- never values -- of API-billed variables that outrank the login. */
  overridingEnvVars: string[]
  /**
   * The API key source the Claude CLI reports seeing, if any. Catches a key
   * that reaches the CLI without appearing in the backend's environment.
   */
  apiKeySource: string | null
  cliPath: string | null
  cliVersion: string | null
  checkedAt: string
  /** Whether this browser may start a sign-in (host machine, launcher on). */
  loginAvailable: boolean
  /** The command to run by hand wherever the button is not offered. */
  loginCommand: string
}

export type ClaudeLoginStart = {
  started: boolean
  command: string
  detail: string
}

/** Non-green states that mean "signing in again fixes this". */
export const RESOLVED_BY_SIGNING_IN: readonly ClaudeConnectionState[] = [
  'not_logged_in',
  'login_expired',
  'console_account',
]

export function needsSignIn(state: ClaudeConnectionState): boolean {
  return RESOLVED_BY_SIGNING_IN.includes(state)
}

/**
 * Three-way severity, because "not green" is not one thing.
 *
 * `api_billed_override` and `console_account` still answer requests -- they
 * just bill somewhere else -- so they read as a warning rather than an outage.
 */
export function severityOf(status: ClaudeConnectionStatus | null): 'ok' | 'warn' | 'down' {
  if (!status) return 'down'
  if (status.connected) {
    return status.expiresInDays !== null && status.expiresInDays <= 3 ? 'warn' : 'ok'
  }
  if (status.state === 'api_billed_override' || status.state === 'console_account') {
    return 'warn'
  }
  return 'down'
}

/** A model the bench will accept. The backend keeps the allow-list. */
export type ClaudeModelChoice = {
  id: string
  label: string
  note: string
}

export type ClaudeTestUsage = {
  inputTokens: number | null
  outputTokens: number | null
  cacheReadInputTokens: number | null
  cacheCreationInputTokens: number | null
}

export type ClaudeTestReply = {
  reply: string
  isError: boolean
  /** The model that actually answered, not the alias that was asked for. */
  model: string | null
  /** Carry this back to continue the same conversation. */
  sessionId: string | null
  costUsd: number | null
  durationMs: number | null
  numTurns: number | null
  stopReason: string | null
  usage: ClaudeTestUsage
}

export type ClaudeTestRequest = {
  prompt: string
  model?: string
  sessionId?: string
}
