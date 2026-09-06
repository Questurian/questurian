import { useEffect, useState } from 'react'
import { readSelection, reviseSelection } from '../intake.api'
import type { SelectableClaim, SelectionReview } from '../intake.types'

/**
 * Which facts the article is written from.
 *
 * Run 9e66bf84 found 105 facts and nothing ever decided which of them the
 * article needed. The outline placed 102 of them and one 200-word section was
 * handed 56 — three and a half words per fact, at which density there is no
 * sentence you can write except a list. The article read like a database
 * because it was one.
 *
 * A model has merged the repeats and put these in order. Where the line falls
 * is a starting point, from how long the article is meant to be. This screen
 * exists so a person moves it.
 *
 * The human step is the point and not a fallback. A model dropping a fact the
 * article needed is a silent loss discovered by reading a worse article; a
 * person dropping it is a decision they made and can undo. Repair may not add
 * a fact the draft did not have, so a cut fact really is gone from this
 * article — which is exactly why the last word is not a model's.
 *
 * Two lists, named. What is left out is in reserve, not missing: it stays in
 * the dossier, stays checkable, and still answers whatever question it
 * answered. Every stage after the writer now knows the difference, so this
 * screen says it in the same words they use.
 */

interface FactPickerProps {
  runId: string
  onChanged: () => void
}

/** What a fact is for, in the words the operator reads. */
const ROLE_LABELS: Record<string, string> = {
  backbone: 'What the piece argues from',
  practical: 'What the reader acts on',
  texture: 'What makes the place real',
}

/* Backbone first, then what the reader acts on, then the seasoning — the same
   order the outline receives them in, so the screen and the plan agree. */
const ROLE_ORDER = ['backbone', 'practical', 'texture', '']

function Fact({
  claim,
  busy,
  onMark,
}: {
  claim: SelectableClaim
  busy: boolean
  onMark: (body: { rescue?: string; drop?: string; clear?: string }) => void
}) {
  const overridden = claim.rescued || claim.dropped
  return (
    <li
      className={`p2b-fact${claim.selected ? '' : ' p2b-fact-cut'}`}
      data-testid={`fact-${claim.claim_id}`}
    >
      <span className="p2b-fact-rank">{claim.rank}</span>
      <div className="p2b-fact-body">
        <p className="p2b-fact-text">{claim.text}</p>
        {claim.texture && (
          /* Named, because the reserve is the only reason it is here. An
             operator cutting it should know they are cutting the colour, not
             trimming a duplicate. */
          <span className="p2b-fact-colour">colour</span>
        )}
        {claim.why && <p className="p2b-fact-why">{claim.why}</p>}
        {claim.merged_in.length > 0 && (
          /* Said rather than hidden: the operator should be able to see that
             three findings became this one, and what the other two said. */
          <p className="p2b-fact-merged">
            Also said by {claim.merged_in.length}{' '}
            {claim.merged_in.length === 1 ? 'other finding' : 'other findings'}:{' '}
            {claim.merged_in.join(' · ')}
          </p>
        )}
      </div>
      <div className="p2b-fact-actions">
        {overridden ? (
          <button
            type="button"
            className="p2b-secondary"
            disabled={busy}
            onClick={() => onMark({ clear: claim.claim_id })}
          >
            {claim.rescued ? 'Kept by hand — undo' : 'Cut by hand — undo'}
          </button>
        ) : claim.selected ? (
          <button
            type="button"
            className="p2b-secondary"
            disabled={busy}
            onClick={() => onMark({ drop: claim.claim_id })}
          >
            Leave it out
          </button>
        ) : (
          <button
            type="button"
            className="p2b-secondary"
            disabled={busy}
            onClick={() => onMark({ rescue: claim.claim_id })}
          >
            Keep it anyway
          </button>
        )}
      </div>
    </li>
  )
}

function FactList({
  claims,
  busy,
  onMark,
}: {
  claims: SelectableClaim[]
  busy: boolean
  onMark: (body: { rescue?: string; drop?: string; clear?: string }) => void
}) {
  return (
    <ul className="p2b-fact-list">
      {claims.map(claim => (
        <Fact key={claim.claim_id} claim={claim} busy={busy} onMark={onMark} />
      ))}
    </ul>
  )
}

export function FactPicker({ runId, onChanged }: FactPickerProps) {
  const [review, setReview] = useState<SelectionReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    void readSelection(runId)
      .then(next => live && setReview(next))
      .catch(() => live && setReview(null))
    return () => {
      live = false
    }
  }, [runId])

  async function send(body: {
    keep_count?: number
    rescue?: string
    drop?: string
    clear?: string
  }) {
    setBusy(true)
    setError('')
    try {
      setReview(await reviseSelection(runId, body))
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.')
    } finally {
      setBusy(false)
    }
  }

  if (!review) {
    return null
  }

  /* A run with no selection used to write from every fact research found.
     Writing now refuses instead, because a ranking that fell over and a person
     keeping everything looked identical from here — so an empty screen would
     be the operator waiting for a hand-off that is never going to happen. */
  if (!review.available || review.claims.length === 0) {
    return (
      <section className="p2b-facts" aria-label="Which facts the article uses">
        <p className="p2b-eyebrow">What the article will be written from</p>
        <p className="p2b-facts-note">
          Nothing has been chosen for this article yet, so it cannot be written.
          The research is safe and nothing was lost — the step that picks which
          findings the writer sees did not produce a list. Run the research
          again, or say plainly that every finding should be kept.
        </p>
      </section>
    )
  }

  const kept = review.claims.filter(claim => claim.selected)
  const reserve = review.claims.filter(claim => !claim.selected)
  const total = review.claims.length
  const grouped = ROLE_ORDER.map(role => ({
    role,
    label: ROLE_LABELS[role] ?? '',
    claims: kept.filter(claim => (claim.role ?? '') === role),
  })).filter(group => group.claims.length > 0)
  /* One unlabelled group is not a grouping. Every selection made before roles
     existed lands there, and heading it "Chosen for this article" above a list
     already headed "For this article" says the same thing twice. */
  const labelled = grouped.filter(group => group.label).length > 0

  return (
    <section className="p2b-facts" aria-label="Which facts the article uses">
      <p className="p2b-eyebrow">What the article will be written from</p>

      <p className="p2b-facts-summary">
        {kept.length} of {total} findings, most useful first.{' '}
        {review.target_word_count
          ? `About ${review.target_word_count} words of article.`
          : null}
      </p>

      {review.stale_reason && (
        /* The same sentence the hand-off would refuse with, shown while the
           operator can still act on it. Somebody answered a question at the
           gate or re-asked one, and this choice was made against the dossier
           as it was before that. */
        <p className="p2b-blocked" role="status">
          {review.stale_reason}
        </p>
      )}

      {review.note && (
        /* When a pass fell over, say so. An order nobody ranked is the order
           research happened to return, and cutting by it is not a decision. */
        <p className="p2b-facts-note">{review.note}</p>
      )}

      <label className="p2b-field p2b-facts-line">
        <span className="p2b-label">How many to keep</span>
        <input
          type="range"
          min={1}
          max={total}
          value={review.keep_count}
          disabled={busy}
          aria-label="How many findings to keep"
          onChange={event => void send({ keep_count: Number(event.target.value) })}
        />
        <span className="p2b-facts-count">{review.keep_count}</span>
      </label>

      {error && <p className="p2b-blocked">{error}</p>}

      <h4 className="p2b-facts-heading">For this article</h4>
      {labelled ? (
        grouped.map(group => (
          <div key={group.role}>
            <p className="p2b-facts-role">{group.label}</p>
            <FactList
              claims={group.claims}
              busy={busy}
              onMark={body => void send(body)}
            />
          </div>
        ))
      ) : (
        <FactList claims={kept} busy={busy} onMark={body => void send(body)} />
      )}

      {reserve.length > 0 && (
        <>
          <button
            type="button"
            className="p2b-secondary"
            onClick={() => setOpen(!open)}
          >
            {open
              ? 'Hide what is in reserve'
              : `Show the ${reserve.length} in reserve`}
          </button>
          {open && (
            <>
              <h4 className="p2b-facts-heading">In reserve</h4>
              <p className="p2b-facts-summary">
                Research found these and they are not in this article. They stay
                in the dossier, stay checked, and still answer whatever question
                they answered. Nothing later will treat them as work the article
                forgot.
              </p>
              <FactList
                claims={reserve}
                busy={busy}
                onMark={body => void send(body)}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}
