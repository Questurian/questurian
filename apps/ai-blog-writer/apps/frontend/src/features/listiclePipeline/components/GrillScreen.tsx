import { useEffect, useRef, useState } from 'react'
import { AnglePicker } from './AnglePicker'
import type { ListicleGrillState } from '../types'

/**
 * The interview, as a conversation.
 *
 * Lifted in shape from the article grill, which got two things right that are
 * worth keeping whatever is being commissioned: it reads as a thread rather
 * than a card, so you can tell whether it is actually learning anything; and
 * the composer arrives pre-filled with a suggested answer, so the operator
 * corrects rather than composes into an empty box.
 *
 * Accepting a suggestion is marked as accepting, not as answering. Those are
 * worth different amounts and nothing shows the difference otherwise.
 *
 * What is NOT shared is the questions. A listicle grill settles a
 * specification — what kind of place, where, how many, what earns a spot —
 * where the article grill settles a vision. They will diverge, and this
 * component is a copy so that they can.
 */

const MARKER_LABELS: Record<string, string> = {
  kind: 'what kind of place',
  place: 'where',
  count: 'how many',
  bar: 'what earns a spot',
  cut: "what's out",
  angles: 'the angles',
}

interface GrillScreenProps {
  state: ListicleGrillState
  busy: boolean
  onAnswer: (text: string) => void
  onReset: () => void
}

export function GrillScreen({ state, busy, onAnswer, onReset }: GrillScreenProps) {
  const pending = state.pending
  const [draft, setDraft] = useState('')
  const endOfThread = useRef<HTMLDivElement>(null)

  // Each new question arrives with its suggestion already in the box.
  useEffect(() => {
    setDraft(pending?.recommendation ?? '')
  }, [pending?.question_id, pending?.recommendation])

  // Follow the conversation the way a chat does. The movement is what tells
  // you something new arrived above the composer.
  useEffect(() => {
    // Optional-called: jsdom does not implement scrollIntoView, and a test
    // environment missing it is not a reason for the component to throw.
    endOfThread.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [state.turns.length, pending?.question_id, state.status])

  const isSuggestion = draft.trim() === (pending?.recommendation ?? '').trim()
  const finished = state.status === 'agreed'
  // One question in this interview is answered by choosing, and it is the one
  // the whole interview exists to reach. The server says so by sending options
  // rather than the screen guessing from the marker.
  const choosing = (pending?.options?.length ?? 0) > 0

  function send() {
    if (!draft.trim() || busy) return
    onAnswer(draft)
  }

  return (
    <section className="lp-chat" aria-label="The interview">
      {state.markers_missing.length > 0 && !finished && (
        // What the specification still needs. An honest progress line -- a
        // question count never was one, because the interview stops when the
        // spec is full, not after N turns.
        <p className="lp-chat-progress">
          <span className="lp-muted">Still to settle:</span>{' '}
          {state.markers_missing.map(m => MARKER_LABELS[m] ?? m).join(', ')}
        </p>
      )}

      <div className="lp-thread" role="log" aria-live="polite">
        <p className="lp-message lp-message-mine lp-message-seed">{state.seed}</p>

        {state.turns.map(turn => (
          <div key={turn.question_id} className="lp-exchange">
            {turn.pushback && <p className="lp-pushback">{turn.pushback}</p>}
            <p className="lp-message lp-message-theirs">{turn.ask}</p>
            <p className="lp-message lp-message-mine">
              {turn.answer}
              {turn.accepted_as_drafted && (
                // Said plainly, because it changes what the answer is worth:
                // you did not object, which is not the same as telling it
                // something.
                <span className="lp-accepted">You accepted the suggestion</span>
              )}
            </p>
          </div>
        ))}

        {finished ? (
          <p className="lp-message lp-message-theirs lp-message-consensus">{state.consensus}</p>
        ) : (
          pending && (
            <div className="lp-exchange">
              {/* Shown above the question it exists to resolve, so the
                  contradiction reads as the reason for asking. */}
              {pending.pushback && <p className="lp-pushback">{pending.pushback}</p>}
              <p className="lp-message lp-message-theirs">{pending.ask}</p>
            </div>
          )
        )}

        <div ref={endOfThread} />
      </div>

      {finished ? (
        <div className="lp-actions lp-chat-actions">
          <button type="button" className="lp-secondary" onClick={onReset} disabled={busy}>
            Start over
          </button>
        </div>
      ) : (
        pending &&
        (choosing ? (
          <AnglePicker options={pending.options} busy={busy} onSend={onAnswer} />
        ) : (
          <div className="lp-composer">
            <label className="lp-visually-hidden" htmlFor="lp-answer">
              Your answer
            </label>
            <textarea
              id="lp-answer"
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
            <div className="lp-composer-actions">
              {isSuggestion && (
                <p className="lp-composer-hint">
                  This is the suggested answer. Edit it, or clear it and say it your way.
                </p>
              )}
              <div className="lp-composer-buttons">
                {isSuggestion && (
                  <button
                    type="button"
                    className="lp-secondary"
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
        ))
      )}
    </section>
  )
}
