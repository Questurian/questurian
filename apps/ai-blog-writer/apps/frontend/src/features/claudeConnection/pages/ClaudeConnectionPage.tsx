import { useState } from 'react'
import { useClaudeStatus } from '../useClaudeStatus'
import { needsSignIn, severityOf } from '../claude-connection.types'
import ClaudeTestBench from '../components/ClaudeTestBench'

const SEVERITY_CLASS = {
  ok: 'connected',
  warn: 'degraded',
  down: 'disconnected',
} as const

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="claude-detail-row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}

function expiryText(expiresInDays: number | null): string | null {
  if (expiresInDays === null) {
    // Claude Code 2.1.x does not publish an expiry. Saying so beats an empty
    // cell that reads as "never expires", which is the dangerous reading.
    return 'Not reported by the Claude CLI'
  }
  if (expiresInDays === 0) return 'Today'
  return `${expiresInDays} day${expiresInDays === 1 ? '' : 's'}`
}

export default function ClaudeConnectionPage() {
  const {
    status,
    error,
    isLoading,
    isRefreshing,
    refresh,
    startLogin,
    isStartingLogin,
    loginError,
    loginStartedCommand,
  } = useClaudeStatus()
  const [copied, setCopied] = useState(false)

  const severity = error ? 'down' : isLoading ? 'warn' : severityOf(status)
  const stateClass = SEVERITY_CLASS[severity]
  const command = status?.loginCommand ?? 'claude auth login --claudeai'

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const headline = error
    ? 'Could not reach the backend'
    : isLoading
      ? 'Checking the Claude connection…'
      : (status?.label ?? 'Unknown')

  const explanation = error
    ? error.message
    : (status?.detail ??
      (status?.connected
        ? 'This machine can reach Claude on the subscription login. Agent SDK requests draw on the plan credit rather than API billing.'
        : null))

  return (
    <div className="claude-connection-page">
      <header className="claude-connection-header">
        <h1>Claude Connection</h1>
        <p>
          Whether this machine can reach Claude on your Claude subscription, and how to
          sign in again when it cannot.
        </p>
      </header>

      <section className={`claude-status-card ${stateClass}`} aria-live="polite">
        <div className="claude-status-headline">
          <span className={`connection-dot ${stateClass}`} />
          <h2>{headline}</h2>
        </div>
        {explanation ? <p className="claude-status-explanation">{explanation}</p> : null}

        {status && status.overridingEnvVars.length > 0 ? (
          <ul className="claude-override-list">
            {status.overridingEnvVars.map((name) => (
              <li key={name}>
                <code>{name}</code> is set and outranks the subscription login
              </li>
            ))}
          </ul>
        ) : null}

        <div className="claude-status-actions">
          {status?.loginAvailable && (!status.connected || needsSignIn(status.state)) ? (
            <button
              type="button"
              className="claude-button claude-button--primary"
              onClick={startLogin}
              disabled={isStartingLogin}
            >
              {isStartingLogin ? 'Opening terminal…' : 'Sign in to Claude'}
            </button>
          ) : null}
          <button
            type="button"
            className="claude-button"
            onClick={refresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Re-checking…' : 'Re-check connection'}
          </button>
        </div>

        {loginStartedCommand ? (
          <p className="claude-status-note">
            A terminal is opening on this machine. Finish signing in there, then
            re-check the connection.
          </p>
        ) : null}
        {loginError ? <p className="claude-status-error">{loginError.message}</p> : null}
      </section>

      <ClaudeTestBench
        blockedReason={
          error
            ? 'The backend is unreachable, so nothing can be sent.'
            : isLoading
              ? 'Checking the connection first…'
              : status?.connected
                ? null
                : (status?.detail ??
                  'Claude is not connected on this machine, so nothing can be sent.')
        }
      />

      <section className="claude-panel">
        <h2>Account</h2>
        <dl className="claude-detail-grid">
          <DetailRow label="Signed in as" value={status?.email ?? null} />
          <DetailRow label="Organization" value={status?.orgName ?? null} />
          <DetailRow label="Plan" value={status?.subscriptionType ?? null} />
          <DetailRow label="Auth method" value={status?.authMethod ?? null} />
          <DetailRow label="Billing path" value={status?.apiProvider ?? null} />
          <DetailRow label="API key seen by the CLI" value={status?.apiKeySource ?? null} />
          <DetailRow
            label="Session expires in"
            value={status ? expiryText(status.expiresInDays) : null}
          />
          <DetailRow label="Claude Code version" value={status?.cliVersion ?? null} />
          <DetailRow label="CLI path" value={status?.cliPath ?? null} />
          <DetailRow
            label="Last checked"
            value={status ? new Date(status.checkedAt).toLocaleString() : null}
          />
        </dl>
      </section>

      <section className="claude-panel">
        <h2>Signing in by hand</h2>
        <p>
          The button above only appears in a browser running on the machine that hosts
          this backend, because signing in signs in <em>that machine</em>, not you.
          Anywhere else, run this in a terminal there:
        </p>
        <div className="claude-command-row">
          <code className="claude-command">{command}</code>
          <button type="button" className="claude-button" onClick={copyCommand}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <section className="claude-panel claude-panel--muted">
        <h2>What this does and does not cover</h2>
        <ul>
          <li>
            This app never sees, stores, or forwards your Claude credentials. It reads{' '}
            <code>claude auth status</code> and shows the answer; the token stays in the
            host machine&rsquo;s Keychain where Claude Code puts it.
          </li>
          <li>
            Agent SDK usage on a subscription draws a per-user monthly credit before
            anything else, and overflow bills at standard API rates.
          </li>
          <li>
            This is the plan holder&rsquo;s own login. Teammates cannot sign in here with
            their own Claude accounts, and requests must not be routed through one
            person&rsquo;s subscription on everyone&rsquo;s behalf — that needs per-person
            seats or a company API key.
          </li>
        </ul>
      </section>
    </div>
  )
}
