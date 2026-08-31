import { useEffect, useRef, useState } from 'react'
import type { IntakeGrill } from '../intake.types'

/**
 * The interview, as a conversation.
 *
 * This was one question on a card with the rest of the exchange summarised
 * above it. It is a chat now, because that is what it always was underneath —
 * a message list replayed on every turn — and reading it as one is how you
 * tell whether the grill is actually learning anything (ADR 0033).
 *
 * The composer arrives pre-filled with the grill's suggested answer. That is
 * the one thing the old design got right and it is not up for negotiation:
 * the people using this write about places they may never have been, and
 * composing into an empty box is the failure the commission form already had.
 *
 * Accepting a suggestion is marked as accepting, not as answering. The grill
 * agreed with itself after two turns when nothing showed the difference.
 */

const MARKER_LABELS: Record<string, string> = {
  form: 'what kind of piece',
  reader: 'who it is for',
  reader_question: 'what it answers',
  outcome: 'what it should do',
  spine: 'what it is built on',
  fails_if: 'what would fail',
}

interface GrillScreenProps {
  grill: IntakeGrill
  busy: boolean
  onAnswer: (text: string) => void
  onApprove: () => void
  onReopen: () => void
}

export function GrillScreen({ grill, busy, onAnswer, onApprove, onReopen }: GrillScreenProps) {
  const pending = grill.pending
  const [draft, setDraft] = useState('')
  const endOfThread = useRef<HTMLDivElement>(null)

  // Each new question arrives with its suggestion already in the box.
  useEffect(() => {
    setDraft(pending?.recommendation ?? '')
  }, [pending?.question_id, pending?.recommendation])

  // Follow the conversation the way a chat does. `smooth` is deliberate: the
  // movement is what tells you something new arrived above the composer.
  useEffect(() => {
    // Optional-called: jsdom does not implement scrollIntoView, and a test
    // environment missing it is not a reason for the component to throw.
    endOfThread.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [grill.turns.length, pending?.question_id, grill.status])

  const isSuggestion = draft.trim() === (pending?.recommendation ?? '').trim()
  const agreed = grill.status === 'agreed'

  function send() {
    if (!draft.trim() || busy) return
    onAnswer(draft)
  }

  return (
    <section className="p2b-chat" aria-label="The interview">
      {grill.markers_missing.length > 0 && !agreed && (
        <p className="p2b-chat-progress">
          <span className="p2b-muted">Still to settle:</span>{' '}
          {grill.markers_missing.map(marker => MARKER_LABELS[marker] ?? marker).join(', ')}
        </p>
      )}

      <div className="p2b-thread" role="log" aria-live="polite">
        <p className="p2b-message p2b-message-mine p2b-message-seed">{grill.seed}</p>

        {grill.turns.map(turn => (
          <div key={turn.question_id} className="p2b-exchange">
            {turn.pushback && <p className="p2b-pushback">{turn.pushback}</p>}
            <p className="p2b-message p2b-message-theirs">{turn.ask}</p>
            <p className="p2b-message p2b-message-mine">
              {turn.answer}
              {turn.accepted_as_drafted && (
                // Said plainly, because it changes what the answer is worth:
                // you did not object, which is not the same as telling it
                // something.
                <span className="p2b-accepted">You accepted the suggestion</span>
              )}
            </p>
          </div>
        ))}

        {agreed ? (
          <p className="p2b-message p2b-message-theirs p2b-message-consensus">
            {grill.consensus}
          </p>
        ) : (
          pending && (
            <div className="p2b-exchange">
              {pending.pushback && <p className="p2b-pushback">{pending.pushback}</p>}
              <p className="p2b-message p2b-message-theirs">{pending.ask}</p>
            </div>
          )
        )}

        <div ref={endOfThread} />
      </div>

      {agreed ? (
        <div className="p2b-intake-actions">
          <button type="button" onClick={onApprove} disabled={busy}>
            Yes, that&rsquo;s the article
          </button>
          <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
            Not quite &mdash; keep talking
          </button>
        </div>
      ) : (
        pending && (
          <div className="p2b-composer">
            <label className="p2b-visually-hidden" htmlFor="p2b-answer">
              Your answer
            </label>
            <textarea
              id="p2b-answer"
              value={draft}
              rows={3}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                // Enter sends, shift+enter breaks the line. The convention
                // every chat already taught them.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              disabled={busy}
            />
            <div className="p2b-composer-actions">
              {isSuggestion && (
                <p className="p2b-composer-hint">
                  This is the grill&rsquo;s suggestion. Edit it, or clear it and say it your
                  way.
                </p>
              )}
              <div className="p2b-composer-buttons">
                {isSuggestion && (
                  <button
                    type="button"
                    className="p2b-secondary"
                    onClick={() => setDraft('')}
                    disabled={busy}
                  >
                    Clear
                  </button>
                )}
                <button type="button" onClick={send} disabled={busy || !draft.trim()}>
                  {isSuggestion ? 'Sounds right' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </section>
  )
}
