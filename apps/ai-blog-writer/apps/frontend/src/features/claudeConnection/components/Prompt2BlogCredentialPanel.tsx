import { useEffect, useState } from 'react'

import {
  deletePrompt2BlogCredential,
  fetchPrompt2BlogCredentialStatus,
  savePrompt2BlogCredential,
} from '../api/claude-connection.api'
import type { Prompt2BlogCredentialStatus } from '../claude-connection.types'

export default function Prompt2BlogCredentialPanel() {
  const [status, setStatus] = useState<Prompt2BlogCredentialStatus | null>(null)
  const [label, setLabel] = useState('Article account')
  const [token, setToken] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchPrompt2BlogCredentialStatus()
      .then(next => {
        if (!active) return
        setStatus(next)
        if (next.label) setLabel(next.label)
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not read account')
      })
    return () => {
      active = false
    }
  }, [])

  async function save() {
    if (!label.trim() || !token.trim()) return
    setBusy(true)
    setError(null)
    try {
      const next = await savePrompt2BlogCredential({ label: label.trim(), token })
      setStatus(next)
      setToken('')
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect account')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      setStatus(await deletePrompt2BlogCredential())
      setToken('')
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect account')
    } finally {
      setBusy(false)
    }
  }

  const connected = status?.configured === true
  return (
    <section className="claude-panel" aria-labelledby="prompt2blog-credential-title">
      <h2 id="prompt2blog-credential-title">Prompt2Blog article account</h2>
      <p className="claude-account-explanation">
        This account writes articles only. Your normal Claude coding app and CLI stay signed
        into their current account.
      </p>

      {connected && !editing ? (
        <>
          <p className="claude-account-current">
            Connected: <strong>{status.label}</strong>
          </p>
          <div className="claude-status-actions">
            <button type="button" className="claude-button" onClick={() => setEditing(true)}>
              Replace account
            </button>
            <button type="button" className="claude-button" onClick={disconnect} disabled={busy}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </>
      ) : (
        <div className="claude-credential-form">
          <p>
            Sign into article account in its browser profile, run <code>claude setup-token</code>,
            then paste token here. Command does not replace normal Claude login.
          </p>
          <label>
            <span>Account label</span>
            <input
              type="text"
              value={label}
              onChange={event => setLabel(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label>
            <span>Setup token</span>
            <input
              type="password"
              value={token}
              onChange={event => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="claude-status-actions">
            <button
              type="button"
              className="claude-button claude-button--primary"
              onClick={save}
              disabled={busy || !label.trim() || !token.trim()}
            >
              {busy ? 'Connecting…' : 'Connect article account'}
            </button>
            {connected ? (
              <button type="button" className="claude-button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      )}
      {error ? <p className="claude-status-error">{error}</p> : null}
    </section>
  )
}
