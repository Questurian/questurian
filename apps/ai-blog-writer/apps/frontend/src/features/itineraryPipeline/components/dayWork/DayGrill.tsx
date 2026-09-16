import { useEffect, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Badge, Step } from './Step'
import type { GrillView } from '../../dayWork/types'

/**
 * The day interview, as a conversation.
 *
 * Two things the article and listicle grills got right are kept whatever is
 * being settled: it reads as a thread, so you can tell whether it is actually
 * learning anything; and the answer box arrives pre-filled with the suggested
 * answer, so the operator corrects rather than composes into a blank.
 *
 * Accepting a suggestion is labelled as accepting, not as answering. They are
 * worth different amounts — one is a decision the operator made and the other
 * is one they did not object to — and nothing else on the screen shows the
 * difference.
 *
 * The questions are this feature's own. A day interview settles what a day is
 * FOR; the article grill settles a vision and the listicle grill a search
 * order. They will diverge, and this component is a sibling so that they can.
 */

const MARKER_LABELS: Record<string, string> = {
  angle: 'what the day is for',
  area: 'where it happens',
  stops: 'what the stops are for',
  limits: 'what is firm and what may bend',
  // An interview started before the shorter list keeps its own topics.
  purpose: 'what the day promises',
  geography: 'where it happens',
  anchors: 'what drives it',
  slot_intent: 'what each stop is for',
  rhythm: 'effort, meals and rest',
  continuity: 'how it fits the other days',
  change_policy: 'what may change',
  unknowns: 'what research must check',
}

export interface DayGrillProps {
  grill: GrillView | null
  tone: 'waiting' | 'active' | 'done'
  busy: boolean
  spending: boolean
  canStart: boolean
  /** Why starting is blocked, when it is. Shown instead of a dead button. */
  blockedReason: string | null
  contextChanged: boolean
  onStart: () => void
  onAnswer: (text: string) => void
  onReopen: () => void
}

export function DayGrill({
  grill,
  tone,
  busy,
  spending,
  canStart,
  blockedReason,
  contextChanged,
  onStart,
  onAnswer,
  onReopen,
}: DayGrillProps) {
  const pending = grill?.pending ?? null
  const [draft, setDraft] = useState('')
  const endOfThread = useRef<HTMLDivElement>(null)

  // Each new question arrives with its suggestion already in the box.
  useEffect(() => {
    setDraft(pending?.recommendation ?? '')
  }, [pending?.question_id, pending?.recommendation])

  // Follow the conversation the way a chat does. The movement is what tells
  // you something new arrived above the box.
  useEffect(() => {
    // Optional-called: jsdom does not implement scrollIntoView, and a test
    // environment missing it is not a reason for the component to throw.
    endOfThread.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [grill?.turns.length, pending?.question_id, grill?.status])

  const isSuggestion = draft.trim() === (pending?.recommendation ?? '').trim()
  const agreed = grill?.status === 'agreed'

  function send() {
    if (!draft.trim() || busy) return
    onAnswer(draft)
  }

  if (!grill) {
    return (
      <Step
        id="ip-grill"
        title="Interview"
        tone={tone}
        badge={<Badge tone="quiet">Not started</Badge>}
        lead={
          <>
            The day Grill is a short interview about what this day is <em>for</em>,
            before any place is chosen. It already knows the trip, this
            day&rsquo;s layout, the stay, your notes and what the other days use.
          </>
        }
        actions={
          <>
            <button
              type="button"
              className="ip-button-primary"
              onClick={onStart}
              disabled={busy || !canStart}
            >
              <MessageSquare size={16} aria-hidden />
              {busy ? 'Starting…' : 'Start day Grill'}
            </button>
            <span className="ip-helper">
              {blockedReason ??
                'This is the first thing here that spends anything. It cannot look ' +
                  'places up — that comes later, outside the app.'}
            </span>
          </>
        }
      />
    )
  }

  return (
    <Step
      id="ip-grill"
      title="Interview"
      tone={tone}
      badge={
        agreed ? (
          <Badge tone="done">Agreed</Badge>
        ) : (
          <Badge>
            {grill.turns.length} question{grill.turns.length === 1 ? '' : 's'} in
          </Badge>
        )
      }
      lead={
        agreed
          ? 'The interview agreed on what this day is for. Its closing summary is the last message below.'
          : 'Answer the question at the bottom. A suggested answer is already filled in — edit it, or send it as it is. The interview ends when every topic is settled, not after a set number of questions.'
      }
    >
      {contextChanged ? (
        <p className="ip-unchecked" role="status">
          This day has changed since the conversation started — the trip, the
          layout, your notes or another day&rsquo;s result. What was said still
          stands; the next question will be asked against the day as it is now.
        </p>
      ) : null}

      {grill.markers_missing.length > 0 && !agreed ? (
        // An honest progress line. A question count never was one: the
        // interview stops when the checklist is full, not after N turns.
        <p className="ip-thread-progress">
          Still to settle:{' '}
          {grill.markers_missing.map(key => MARKER_LABELS[key] ?? key).join(', ')}
        </p>
      ) : null}

      <div className="ip-thread" role="log" aria-live="polite">
        <p className="ip-message ip-message-seed">{grill.seed}</p>

        {grill.turns.map(turn => (
          <div key={turn.question_id} className="ip-exchange">
            {turn.pushback ? <p className="ip-pushback">{turn.pushback}</p> : null}
            <p className="ip-message ip-message-theirs">{turn.ask}</p>
            <p className="ip-message ip-message-mine">
              {turn.answer}
              {turn.accepted_as_drafted ? (
                // Said plainly, because it changes what the answer is worth:
                // you did not object, which is not the same as telling it
                // something.
                <span className="ip-accepted">You accepted the suggestion</span>
              ) : null}
            </p>
          </div>
        ))}

        {agreed ? (
          <p className="ip-message ip-message-theirs ip-message-consensus">
            {grill.consensus}
          </p>
        ) : pending ? (
          <div className="ip-exchange">
            {/* Above the question it exists to resolve, so the contradiction
                reads as the reason for asking. */}
            {pending.pushback ? <p className="ip-pushback">{pending.pushback}</p> : null}
            <p className="ip-message ip-message-theirs">{pending.ask}</p>
          </div>
        ) : null}

        <div ref={endOfThread} />
      </div>

      {agreed ? (
        <div className="ip-step-actions">
          <button
            type="button"
            className="ip-button-quiet"
            onClick={onReopen}
            disabled={busy}
          >
            Not quite — keep talking
          </button>
          <span className="ip-helper">
            Reopening keeps everything said so far and asks again. It costs one
            more turn.
          </span>
        </div>
      ) : pending ? (
        <div className="ip-answer">
          <label className="ip-sr-only" htmlFor="ip-day-answer">
            Your answer
          </label>
          <textarea
            id="ip-day-answer"
            rows={3}
            value={draft}
            disabled={busy}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              // Enter sends, shift+enter breaks the line. The convention every
              // chat already taught them.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
          />
          <div className="ip-answer-actions">
            <p className="ip-answer-hint">
              {spending
                ? 'Thinking about the next question…'
                : isSuggestion
                  ? 'This is the suggested answer. Edit it, or clear it and say it your way.'
                  : 'Shift + Enter for a new line.'}
            </p>
            {isSuggestion ? (
              <button
                type="button"
                className="ip-button-quiet"
                onClick={() => setDraft('')}
                disabled={busy}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              className="ip-button-primary"
              onClick={send}
              disabled={busy || !draft.trim()}
            >
              {isSuggestion ? 'Sounds right' : 'Send'}
            </button>
          </div>
        </div>
      ) : null}
    </Step>
  )
}
