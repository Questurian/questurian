import { useEffect, useState } from 'react'
import type { IntakeGrill } from '../intake.types'

/**
 * One question at a time, with the answer already proposed.
 *
 * The recommendation is the whole point: the people using this write about
 * places they may never have been, and correcting a proposal is easy where
 * composing one from a blank field is not. So the box starts filled, and
 * accepting is a single click.
 */

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

  // Each new question arrives with its recommendation already in the box.
  useEffect(() => {
    setDraft(pending?.recommendation ?? '')
  }, [pending?.question_id, pending?.recommendation])

  if (grill.status === 'agreed') {
    return (
      <section className="p2b-intake" aria-label="What we agreed">
        <p className="p2b-eyebrow">What we agreed</p>
        <p className="p2b-consensus">{grill.consensus}</p>
        <div className="p2b-intake-actions">
          <button type="button" onClick={onApprove} disabled={busy}>
            Yes, that&rsquo;s the article
          </button>
          <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
            Not quite &mdash; keep talking
          </button>
        </div>
      </section>
    )
  }

  if (!pending) return null

  return (
    <section className="p2b-intake" aria-label="Question">
      {grill.turns.length > 0 && (
        <ol className="p2b-transcript">
          {grill.turns.map(turn => (
            <li key={turn.question_id}>
              <p className="p2b-transcript-ask">{turn.ask}</p>
              <p className="p2b-transcript-answer">{turn.answer}</p>
            </li>
          ))}
        </ol>
      )}

      <p className="p2b-eyebrow">{pending.topic}</p>
      {pending.pushback && (
        // Shown above the question because it is the reason this question
        // exists: something contradicted the seed or an earlier answer.
        <p className="p2b-pushback">{pending.pushback}</p>
      )}
      <p className="p2b-question">{pending.ask}</p>

      <label className="p2b-field">
        <span className="p2b-label">Your answer</span>
        <textarea
          value={draft}
          rows={3}
          onChange={event => setDraft(event.target.value)}
          disabled={busy}
        />
      </label>

      <div className="p2b-intake-actions">
        <button type="button" onClick={() => onAnswer(draft)} disabled={busy || !draft.trim()}>
          {draft.trim() === pending.recommendation.trim() ? 'Sounds right' : 'Send'}
        </button>
      </div>
    </section>
  )
}
