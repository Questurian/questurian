import { useEffect, useState } from 'react'
import { readGate, reaskQuestion, settleGate } from '../intake.api'
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
 * So each blocking question offers the honest answers. Either you found it,
 * or nobody publishes it. The second is not a workaround: "Moravia Tours takes
 * bookings directly and posts no price" is a sentence that belongs in the
 * article, and the coverage rules have accepted that verdict since the Lima
 * airport run stalled on times no agency publishes.
 *
 * The fourth move is asking again. Run 76b36468 asked about a project "in
 * Buenos Aires" and research answered about Argentina — the article is about
 * Medellín, whose Buenos Aires is a neighbourhood. The question was fine; the
 * answer was about the wrong continent. Dropping it threw away a good
 * question, and answering it by hand meant doing the research yourself.
 *
 * It is set apart from the other three because it is the only one that spends
 * money: it buys one search, not the whole pass again.
 *
 * The fifth is "nothing like this exists", and run a2066506 needed it twice.
 * Research was asked for three 4-star hotels within five blocks of the Plaza
 * Mayor, came back with three named properties and the finding that no genuine
 * 4-star is in that radius, and the run blocked — because the system could not
 * tell "we failed to find it" from "it is not there". Those are opposite
 * outcomes and they looked identical from the inside.
 *
 * And the screen now says which move fits. It used to show the question, what
 * research found, the gap, and then four buttons with no indication which one
 * was right, leaving the operator to read a dozen bullets and infer it. The
 * diagnosis was already in the notes — "Booking.com published no separate
 * aggregate figure" — so research now declares it and the gate reads it out. A
 * suggestion, never a decision: every other move stays one click away.
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
  const [mode, setMode] = useState<
    'idle' | 'answer' | 'unpublished' | 'nonexistent' | 'omit' | 'reask'
  >('idle')
  const suggested = question.suggestion?.move ?? null
  const [text, setText] = useState('')
  const [rewritten, setRewritten] = useState(question.question)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(body: Parameters<typeof settleGate>[1]) {
    setSaving(true)
    setError(null)
    try {
      await settleGate(runId, body)
      onSettled()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That could not be saved.')
      setSaving(false)
    }
  }

  function submit() {
    if (!text.trim()) return
    void send({
      requirement_id: question.requirement_id,
      ...(mode === 'answer'
        ? { answer: text, source_url: url.trim() || undefined }
        : mode === 'nonexistent'
          ? { nonexistent_note: text }
          : { unpublished_note: text }),
    })
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
        <>
          {question.suggestion && (
            <p className="p2b-gate-suggestion">
              <span className="p2b-label">What this looks like</span>
              {question.suggestion.why}
            </p>
          )}
          <div className="p2b-intake-actions">
            <button
              type="button"
              className={suggested && suggested !== 'answer' ? 'p2b-secondary' : undefined}
              onClick={() => setMode('answer')}
            >
              I&rsquo;ll answer this
            </button>
            <button
              type="button"
              className={suggested === 'unpublished' ? undefined : 'p2b-secondary'}
              onClick={() => setMode('unpublished')}
            >
              Nobody publishes this
            </button>
            <button
              type="button"
              className={suggested === 'nonexistent' ? undefined : 'p2b-secondary'}
              onClick={() => setMode('nonexistent')}
            >
              Nothing like this exists
            </button>
            <button
              type="button"
              className={suggested === 'reask' ? undefined : 'p2b-secondary'}
              onClick={() => setMode('reask')}
            >
              Ask it differently
            </button>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => setMode('omit')}
            >
              Drop the question
            </button>
          </div>
        </>
      ) : mode === 'reask' ? (
        <div className="p2b-gate-form">
          <label className="p2b-field">
            <span className="p2b-label">The question, rewritten</span>
            <textarea
              value={rewritten}
              rows={3}
              onChange={event => setRewritten(event.target.value)}
              disabled={saving}
            />
          </label>
          {/* The one move here that costs anything, said before they press it
              rather than after. */}
          <p className="p2b-note">
            This buys one new search and re-reads the research. Every other
            question keeps the answer it already has.
          </p>
          {error && <p className="p2b-gate-error">{error}</p>}
          <div className="p2b-intake-actions">
            <button
              type="button"
              onClick={() => {
                setSaving(true)
                setError(null)
                reaskQuestion(runId, {
                  requirement_id: question.requirement_id,
                  question: rewritten,
                })
                  .then(onSettled)
                  .catch((cause: unknown) => {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : 'That could not be asked again.',
                    )
                    setSaving(false)
                  })
              }}
              disabled={
                saving ||
                !rewritten.trim() ||
                rewritten.trim() === question.question.trim()
              }
            >
              {saving ? 'Searching' : 'Ask it again'}
            </button>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => {
                setRewritten(question.question)
                setMode('idle')
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === 'omit' ? (
        <div className="p2b-gate-form">
          {/* Said once, plainly, then obeyed. Cutting a load-bearing question
              is a real decision and it is allowed to be wrong (ADR 0030). */}
          <p className="p2b-gate-gap">
            Drop this and the article can no longer claim anything that rested on
            it. Everything else research found is kept.
          </p>
          {error && <p className="p2b-gate-error">{error}</p>}
          <div className="p2b-intake-actions">
            <button
              type="button"
              onClick={() =>
                void send({ requirement_id: question.requirement_id, omit: true })
              }
              disabled={saving}
            >
              {saving ? 'Dropping' : 'Drop it and continue'}
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
      ) : (
        <div className="p2b-gate-form">
          <label className="p2b-field">
            <span className="p2b-label">
              {mode === 'answer'
                ? 'Your answer, in your own words'
                : mode === 'nonexistent'
                  ? 'What is there instead'
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
                  : mode === 'nonexistent'
                    ? 'No 4-star hotel within five blocks of the Plaza Mayor. The nearest is the Sheraton, 1.4 km away.'
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

          {mode === 'nonexistent' && (
            /* The claims research found stay, and they are the point: they are
               what makes the absence a finding rather than an assertion. */
            <p className="p2b-note">
              Use this when research answered and the answer was that the thing
              is not there. What it found instead stays on the record — that is
              what lets the article state the absence rather than assert it. If
              research simply found nothing, answer it or ask it differently.
            </p>
          )}

          {error && <p className="p2b-gate-error">{error}</p>}

          <div className="p2b-intake-actions">
            <button type="button" onClick={submit} disabled={saving || !text.trim()}>
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
