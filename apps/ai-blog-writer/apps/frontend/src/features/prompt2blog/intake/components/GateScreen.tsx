import { useEffect, useState } from 'react'
import { readGate, settleGate } from '../intake.api'
import type { GateQuestion } from '../intake.types'

/**
 * What is holding the run up, and the two ways past it.
 *
 * One gate blocks in the whole pipeline and it sits before writing, so an
 * article is never built on a fact nobody confirmed. Until now a blocked run
 * had a single exit — back to the grill — which throws away the research it
 * already paid for. Run 76b36468 was stopped by one co-op that does not
 * publish its price, with six of seven questions answered and ten web searches
 * spent.
 *
 * So each blocking question offers both honest answers. Either you found it,
 * or nobody publishes it. The second is not a workaround: "Moravia Tours takes
 * bookings directly and posts no price" is a sentence that belongs in the
 * article, and the coverage rules have accepted that verdict since the Lima
 * airport run stalled on times no agency publishes.
 */

interface GateScreenProps {
  runId: string
  onSettled: () => void
  onReopen: () => void
  busy: boolean
}

function Question({
  runId,
  question,
  onSettled,
}: {
  runId: string
  question: GateQuestion
  onSettled: () => void
}) {
  const [mode, setMode] = useState<'idle' | 'answer' | 'unpublished'>('idle')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      await settleGate(runId, {
        requirement_id: question.requirement_id,
        ...(mode === 'answer'
          ? { answer: text, source_url: url.trim() || undefined }
          : { unpublished_note: text }),
      })
      onSettled()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be saved.')
      setSaving(false)
    }
  }

  return (
    <li className="p2b-gate-question">
      <p className="p2b-gate-ask">{question.question}</p>

      {question.found.length > 0 && (
        <div className="p2b-gate-found">
          <span className="p2b-label">What the research did find</span>
          <ul>
            {question.found.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {question.gap && <p className="p2b-gate-gap">{question.gap}</p>}

      {mode === 'idle' ? (
        <div className="p2b-intake-actions">
          <button type="button" onClick={() => setMode('answer')}>
            I&rsquo;ll answer this
          </button>
          <button
            type="button"
            className="p2b-secondary"
            onClick={() => setMode('unpublished')}
          >
            Nobody publishes this
          </button>
        </div>
      ) : (
        <div className="p2b-gate-form">
          <label className="p2b-field">
            <span className="p2b-label">
              {mode === 'answer'
                ? 'Your answer, in your own words'
                : 'What you looked for, and where'}
            </span>
            <textarea
              value={text}
              rows={3}
              onChange={event => setText(event.target.value)}
              disabled={saving}
              placeholder={
                mode === 'answer'
                  ? 'They quote COP 60,000 per person, over WhatsApp only.'
                  : 'Moravia Tours takes bookings directly and posts no price on its site.'
              }
            />
          </label>

          {mode === 'answer' && (
            <>
              <label className="p2b-field">
                <span className="p2b-label">A link, if you have one (optional)</span>
                <input
                  type="text"
                  value={url}
                  onChange={event => setUrl(event.target.value)}
                  disabled={saving}
                />
              </label>
              {/* Said plainly, because it is the one thing that changes about
                  this fact: nothing downstream will check it. */}
              <p className="p2b-note">
                This goes in as your own word. Nothing checks it, and the record
                will show the answer came from you rather than from the research.
              </p>
            </>
          )}

          {mode === 'unpublished' && (
            <p className="p2b-note">
              The article can say this outright. It is a real finding, not a
              workaround.
            </p>
          )}

          {error && <p className="p2b-gate-error">{error}</p>}

          <div className="p2b-intake-actions">
            <button type="button" onClick={send} disabled={saving || !text.trim()}>
              {saving ? 'Saving' : 'Save and continue'}
            </button>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => setMode('idle')}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

export function GateScreen({ runId, onSettled, onReopen, busy }: GateScreenProps) {
  const [blocking, setBlocking] = useState<GateQuestion[] | null>(null)

  useEffect(() => {
    void readGate(runId)
      .then(result => setBlocking(result.blocking))
      .catch(() => setBlocking([]))
  }, [runId])

  return (
    <section className="p2b-intake" aria-label="What is holding this up">
      <p className="p2b-eyebrow">The research came up short</p>
      <p className="p2b-question">
        {blocking?.length === 1
          ? 'One question is unanswered, and the article leans on it.'
          : `${blocking?.length ?? ''} questions are unanswered, and the article leans on them.`}
      </p>
      <p className="p2b-note">
        Everything else was found and is kept. Settling these here does not
        re-run the research.
      </p>

      {blocking === null ? (
        <p className="p2b-note">Reading what is missing&hellip;</p>
      ) : (
        <ul className="p2b-gate-list">
          {blocking.map(question => (
            <Question
              key={question.requirement_id}
              runId={runId}
              question={question}
              onSettled={onSettled}
            />
          ))}
        </ul>
      )}

      <div className="p2b-intake-actions">
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Back to the grill instead
        </button>
      </div>
    </section>
  )
}
