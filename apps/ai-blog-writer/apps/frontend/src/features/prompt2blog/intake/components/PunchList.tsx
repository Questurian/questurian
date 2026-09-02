import { useEffect, useState } from 'react'
import { readPunchList } from '../intake.api'
import type { PunchList as PunchListPayload, PunchListItem } from '../intake.types'

/**
 * What to fix by hand, in twenty minutes.
 *
 * The run ends with an article, a stamp and some measurements, and nothing
 * that says what to do about it. This is the other branch from the polish
 * prompt: that one hands the piece to a chatbot, this one hands it back to the
 * person, who knows things no model does.
 *
 * The distinction that carries the whole screen is where each fact comes from.
 * An item marked as already researched can be acted on immediately — that fact
 * was checked and graded before the writing started, and the claim shown under
 * it is quoted from the dossier rather than written by the read. An item marked
 * as unresearched says what is missing and never what it is. Run 062c0b86 was
 * headlined "older than the Inca Empire" and gave no date; the useful note is
 * that the date was never established, and a note supplying one would put an
 * invented fact into a published article at the last possible moment.
 *
 * Not a gate and not a score. Nothing here blocks anything, and there is no
 * number: "7/10" tells a person nothing they can act on.
 */

interface PunchListProps {
  runId: string
}

const KIND_LABELS: Record<PunchListItem['kind'], string> = {
  add_sentence: 'Add a sentence',
  add_paragraph: 'Add a paragraph',
  move: 'Move',
  rephrase: 'Rephrase',
  cut: 'Cut',
}

function Item({ item, index }: { item: PunchListItem; index: number }) {
  const researched = item.needs === 'have_it'
  return (
    <li className="p2b-punch-item">
      <div className="p2b-punch-head">
        <span className="p2b-punch-rank">{index + 1}</span>
        <span className="p2b-kind">{KIND_LABELS[item.kind]}</span>
        <span className="p2b-punch-where">
          {item.heading || 'The article overall'}
          {item.where && <span className="p2b-punch-quote">“{item.where}”</span>}
        </span>
      </div>

      <p className="p2b-punch-note">{item.note}</p>

      {researched ? (
        <div className="p2b-punch-have">
          <span className="p2b-label">You already have this</span>
          <ul>
            {item.have.map(claim => (
              <li key={claim.claim_id}>{claim.text}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="p2b-punch-missing">
          Nobody established this. It needs looking up before it goes in.
        </p>
      )}
    </li>
  )
}

export function PunchList({ runId }: PunchListProps) {
  const [notes, setNotes] = useState<PunchListPayload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void readPunchList(runId)
      .then(result => live && setNotes(result))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [runId])

  // A failure here loses the notes, not the article, which is the reason this
  // is allowed to run at all. Said quietly and then left alone.
  if (failed) {
    return (
      <section className="p2b-punch" aria-label="What to fix by hand">
        <p className="p2b-eyebrow">What to fix by hand</p>
        <p className="p2b-note">
          The read did not come back. The article is unaffected.
        </p>
      </section>
    )
  }

  if (!notes) {
    return (
      <section className="p2b-punch" aria-label="What to fix by hand">
        <p className="p2b-eyebrow">What to fix by hand</p>
        <p className="p2b-note">Reading it…</p>
      </section>
    )
  }

  const unusedOnly = notes.items.length === 0 && notes.researched_and_unused.length > 0
  if (notes.items.length === 0 && !unusedOnly) return null

  return (
    <section className="p2b-punch" aria-label="What to fix by hand">
      <p className="p2b-eyebrow">What to fix by hand</p>
      <p className="p2b-note">
        Twenty minutes of edits, best first. Most need no new information — they
        move or re-point something the article already earned.
      </p>

      {notes.items.length > 0 && (
        <ol className="p2b-punch-list">
          {notes.items.map((item, index) => (
            <Item key={`${item.heading}-${index}`} item={item} index={index} />
          ))}
        </ol>
      )}

      {notes.researched_and_unused.length > 0 && (
        /* The half that needed no model, and stands whatever the read said:
           these were checked and graded before the writing started. */
        <div className="p2b-punch-unused">
          <span className="p2b-label">
            Researched and never used — safe to add today
          </span>
          <ul>
            {notes.researched_and_unused.map(claim => (
              <li key={claim.claim_id}>{claim.text}</li>
            ))}
          </ul>
        </div>
      )}

      {notes.dropped.length > 0 && (
        /* Shown rather than swallowed. A dropped item is usually the read
           reaching for a figure the run does not have, and knowing it happened
           is worth more than a silently shorter list. */
        <ul className="p2b-punch-dropped">
          {notes.dropped.map(reason => (
            <li key={reason}>Not shown: {reason}.</li>
          ))}
        </ul>
      )}
    </section>
  )
}
