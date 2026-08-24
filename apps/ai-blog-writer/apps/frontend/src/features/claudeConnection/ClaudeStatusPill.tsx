import { Link } from 'react-router-dom'
import { useClaudeStatus } from './useClaudeStatus'
import { severityOf } from './claude-connection.types'

const SEVERITY_CLASS = {
  ok: 'connected',
  warn: 'degraded',
  down: 'disconnected',
} as const

export const CLAUDE_CONNECTION_PATH = '/settings/claude'

type ClaudeStatusPillProps = {
  variant?: 'desktop' | 'mobile'
  onNavigate?: () => void
}

/**
 * Nav indicator for the Claude subscription login, beside the Payload one.
 *
 * It is not decoration. Subscription OAuth expires, and Claude Code's own
 * three-day warning only appears in its terminal UI -- a backend calling the
 * Agent SDK gets none, and requests simply start failing. This pill is the
 * advance signal, and it links to the page that can fix it.
 */
export default function ClaudeStatusPill({
  variant = 'desktop',
  onNavigate,
}: ClaudeStatusPillProps) {
  const { status, error, isLoading } = useClaudeStatus()

  const severity = error ? 'down' : isLoading ? 'warn' : severityOf(status)
  const stateClass = SEVERITY_CLASS[severity]

  const label = error
    ? 'Claude Unreachable'
    : isLoading
      ? 'Claude Checking'
      : (status?.label ?? 'Claude Unknown')

  const title = error
    ? `Could not read the Claude connection: ${error.message}`
    : (status?.detail ??
      (status?.connected
        ? `Signed in${status.email ? ` as ${status.email}` : ''}`
        : 'Checking the Claude connection'))

  const className =
    variant === 'mobile'
      ? `nav-mobile-connection claude-status-pill ${stateClass}`
      : `nav-connection-status claude-status-pill ${stateClass}`

  return (
    <Link to={CLAUDE_CONNECTION_PATH} className={className} title={title} onClick={onNavigate}>
      <span className={`connection-dot ${stateClass}`} />
      <span className="connection-text">{label}</span>
    </Link>
  )
}
