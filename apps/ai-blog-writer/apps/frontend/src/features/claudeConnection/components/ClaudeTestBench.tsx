import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  fetchClaudeModels,
  sendClaudeTestMessage,
} from '../api/claude-connection.api'
import type { ClaudeTestReply } from '../claude-connection.types'

type Exchange = {
  id: number
  prompt: string
  reply: ClaudeTestReply | null
  error: string | null
}

type ClaudeTestBenchProps = {
  /** Why the bench is unavailable, or null when it can send. */
  blockedReason: string | null
}

function formatCost(costUsd: number | null): string {
  if (costUsd === null) return '—'
  // Bench messages land between a tenth of a cent and a few cents. Dollars at
  // that scale read as "$0.0161", which nobody parses at a glance.
  if (costUsd < 1) return `${(costUsd * 100).toFixed(2)}¢`
  return `$${costUsd.toFixed(2)}`
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return '—'
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
}

function ReplyMeta({ reply }: { reply: ClaudeTestReply }) {
  const { usage } = reply
  const tokens =
    usage.inputTokens !== null && usage.outputTokens !== null
      ? `${usage.inputTokens} in / ${usage.outputTokens} out`
      : null

  return (
    <div className="bench-meta">
      <span>{reply.model ?? 'unknown model'}</span>
      <span>{formatDuration(reply.durationMs)}</span>
      <span>{formatCost(reply.costUsd)}</span>
      {tokens ? <span>{tokens}</span> : null}
      {reply.stopReason && reply.stopReason !== 'end_turn' ? (
        <span>stopped: {reply.stopReason}</span>
      ) : null}
    </div>
  )
}

/**
 * A bench for asking Claude one question and seeing what comes back.
 *
 * Not the writing pipeline and not connected to it. Its job is to answer "does
 * this work, on which model, how fast, and what did it cost" without anyone
 * having to run a pipeline stage to find out.
 *
 * Messages carry a session id forward, so the conversation has memory. That is
 * also the cheap path: continuing a session turns the system prompt into a
 * cache read rather than a cache write.
 */
export default function ClaudeTestBench({ blockedReason }: ClaudeTestBenchProps) {
  const [prompt, setPrompt] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [model, setModel] = useState('haiku')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const nextId = useRef(1)

  const modelsQuery = useQuery({
    queryKey: ['claude', 'models'],
    queryFn: fetchClaudeModels,
    retry: false,
    staleTime: Infinity,
  })

  // The turn awaiting a reply, by id. Matching on the prompt text instead
  // would attach the answer to the wrong turn the moment someone sends the
  // same message twice.
  const pendingId = useRef<number | null>(null)

  const settlePending = (patch: Partial<Exchange>) => {
    const target = pendingId.current
    pendingId.current = null
    if (target === null) return
    setExchanges((current) =>
      current.map((exchange) =>
        exchange.id === target ? { ...exchange, ...patch } : exchange,
      ),
    )
  }

  const send = useMutation({
    mutationFn: sendClaudeTestMessage,
    onSuccess: (reply) => {
      if (reply.sessionId) {
        setSessionId(reply.sessionId)
      }
      settlePending({ reply })
    },
    onError: (error: Error) => {
      settlePending({ error: error.message })
    },
  })

  const models = modelsQuery.data ?? []
  const selectedNote = models.find((choice) => choice.id === model)?.note ?? null
  const totalCost = exchanges.reduce(
    (sum, exchange) => sum + (exchange.reply?.costUsd ?? 0),
    0,
  )
  const isBlocked = blockedReason !== null

  function handleSend() {
    const trimmed = prompt.trim()
    if (!trimmed || send.isPending || isBlocked) return

    const id = nextId.current++
    pendingId.current = id
    setExchanges((current) => [
      ...current,
      { id, prompt: trimmed, reply: null, error: null },
    ])
    setPrompt('')
    send.mutate({
      prompt: trimmed,
      model,
      ...(sessionId ? { sessionId } : {}),
    })
  }

  function handleReset() {
    setExchanges([])
    setSessionId(null)
    pendingId.current = null
    send.reset()
  }

  return (
    <section className="claude-panel claude-bench">
      <div className="claude-bench-header">
        <h2>Test a message</h2>
        {exchanges.length > 0 ? (
          <button type="button" className="claude-button" onClick={handleReset}>
            New conversation
          </button>
        ) : null}
      </div>

      <p className="claude-bench-intro">
        Ask Claude something and see whether it answers, on which model, and what it
        cost. This does not touch the article pipeline. Messages in one conversation
        remember each other; <strong>New conversation</strong> starts fresh.
      </p>

      {isBlocked ? <p className="claude-status-error">{blockedReason}</p> : null}

      <div className="claude-bench-controls">
        <label className="claude-bench-field">
          <span>Model</span>
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={isBlocked || modelsQuery.isPending}
          >
            {models.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        {selectedNote ? <p className="claude-bench-note">{selectedNote}</p> : null}
      </div>

      {exchanges.length > 0 ? (
        <ol className="claude-bench-transcript">
          {exchanges.map((exchange) => (
            <li key={exchange.id} className="claude-bench-turn">
              <div className="bench-bubble bench-bubble--you">
                <span className="bench-who">You</span>
                <p>{exchange.prompt}</p>
              </div>
              <div
                className={`bench-bubble bench-bubble--claude${
                  exchange.error || exchange.reply?.isError ? ' bench-bubble--failed' : ''
                }`}
              >
                <span className="bench-who">Claude</span>
                {exchange.error ? (
                  <p>{exchange.error}</p>
                ) : exchange.reply ? (
                  <>
                    <p>{exchange.reply.reply || '(empty reply)'}</p>
                    <ReplyMeta reply={exchange.reply} />
                  </>
                ) : (
                  <p className="bench-waiting">Waiting for a reply…</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="claude-bench-compose">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              handleSend()
            }
          }}
          placeholder="Ask Claude anything — try “Reply with exactly: OK”"
          rows={3}
          disabled={isBlocked}
          aria-label="Message to send to Claude"
        />
        <div className="claude-bench-send-row">
          <span className="claude-bench-hint">
            {totalCost > 0 ? `This conversation: ${formatCost(totalCost)}` : 'Cmd/Ctrl + Enter to send'}
          </span>
          <button
            type="button"
            className="claude-button claude-button--primary"
            onClick={handleSend}
            disabled={isBlocked || send.isPending || !prompt.trim()}
          >
            {send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  )
}
