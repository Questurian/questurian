import { useEffect, useState } from 'react'
import { markVenue, readVenues } from '../intake.api'
import type { VenueToCheck } from '../intake.types'

/**
 * The last thing a person looks at before the article recommends it.
 *
 * Research found Moravia Tours, its site, and both founders by name, and every
 * word was true. What it could not see: last post 2024, a janky checkout,
 * tired photos. A business winding down is not a fact on a page — it is the
 * absence of recent activity — and no amount of better research closes that.
 *
 * Liveness, not quality. The operator has not taken these tours either and
 * cannot say whether they are good. They can tell alive from abandoned, which
 * is exactly what went wrong, and naming it accurately is what keeps this a two
 * minute job instead of a review of places nobody has been.
 *
 * Three moves, because two were not enough. Run a2066506 listed McDonald's,
 * Starbucks and KFC — places whose status nobody doubts — and the only way to
 * clear one was to drop it, which takes the claim out of the dossier and can
 * put the run back behind the gate. So the obvious move was the costly one.
 * "Not worth checking" is the free one, and a drop that would cost something
 * now says so before the click.
 *
 * Not a gate. Exactly one gate blocks in this pipeline (ADR 0030) and this is
 * not it: everything here is skippable in one click.
 */

interface VenueCheckProps {
  runId: string
  onChanged: () => void
}

function Venue({
  runId,
  venue,
  onChanged,
  onSettled,
}: {
  runId: string
  venue: VenueToCheck
  onChanged: () => void
  onSettled: () => void
}) {
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState(venue.note)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'dropped' | 'dismissed' | 'noted' | null>(null)
  const costsAQuestion = venue.sole_support_for.length > 0

  async function send(
    outcome: 'dropped' | 'dismissed' | 'noted',
    body: { drop?: boolean; dismiss?: boolean; note?: string },
  ) {
    setBusy(true)
    try {
      await markVenue(runId, { claim_id: venue.claim_id, ...body })
      setDone(outcome)
      onChanged()
      onSettled()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={`p2b-venue${done === 'dropped' ? ' p2b-venue-dropped' : ''}`}>
      <div className="p2b-venue-head">
        <span className="p2b-venue-name">{venue.venue}</span>
        {venue.urls.map(url => (
          <a key={url} href={url} target="_blank" rel="noreferrer noopener">
            open
          </a>
        ))}
      </div>

      <p className="p2b-venue-claim">{venue.text}</p>

      {done ? (
        <p className="p2b-venue-done">
          {done === 'dropped'
            ? 'Dropped. It will not reach the writer.'
            : done === 'dismissed'
              ? 'Left alone. It stays in the dossier; you just will not be asked again.'
              : `Noted: ${note}`}
        </p>
      ) : noting ? (
        <>
          <label className="p2b-field">
            <span className="p2b-label">What you saw</span>
            <textarea
              value={note}
              rows={2}
              onChange={event => setNote(event.target.value)}
              disabled={busy}
              placeholder="Still listed but quiet. Last post 2024, and the checkout is rough."
            />
          </label>
          <div className="p2b-intake-actions">
            <button
              type="button"
              onClick={() => void send('noted', { note })}
              disabled={busy || !note.trim()}
            >
              Save the note
            </button>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => setNoting(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          {costsAQuestion ? (
            <p className="p2b-venue-cost">
              Dropping this puts{' '}
              {venue.sole_support_for.length === 1
                ? 'a question'
                : `${venue.sole_support_for.length} questions`}{' '}
              back behind the gate — it is the only thing supporting{' '}
              {venue.sole_support_for.join(', ')}. A note costs nothing.
            </p>
          ) : null}
          <div className="p2b-intake-actions">
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => void send('dropped', { drop: true })}
              disabled={busy}
            >
              Drop it
            </button>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => setNoting(true)}
              disabled={busy}
            >
              Add a note
            </button>
            <button
              type="button"
              className="p2b-secondary"
              onClick={() => void send('dismissed', { dismiss: true })}
              disabled={busy}
            >
              Not worth checking
            </button>
          </div>
        </>
      )}
    </li>
  )
}

export function VenueCheck({ runId, onChanged }: VenueCheckProps) {
  const [venues, setVenues] = useState<VenueToCheck[] | null>(null)
  const [skipped, setSkipped] = useState(false)

  useEffect(() => {
    void readVenues(runId)
      .then(result => setVenues(result.venues))
      .catch(() => setVenues([]))
  }, [runId])

  /**
   * Re-read what each remaining drop would cost, because one drop changes the
   * others. Two claims holding up a question both cost nothing to drop until
   * the first one goes — and then the second is the only support left. Read
   * once at mount, that second row would still be promising it was free.
   *
   * Rows are updated in place rather than replaced: a dropped claim is gone
   * from the server's list, and the operator should still see that it was
   * dropped.
   */
  function refreshCosts() {
    void readVenues(runId)
      .then(result => {
        const fresh = new Map(result.venues.map(v => [v.claim_id, v.sole_support_for]))
        setVenues(
          current =>
            current?.map(venue => ({
              ...venue,
              sole_support_for: fresh.get(venue.claim_id) ?? venue.sole_support_for,
            })) ?? null,
        )
      })
      .catch(() => {
        /* The costs stay as last read. Nothing here blocks the run. */
      })
  }

  if (skipped || venues === null || venues.length === 0) return null

  return (
    <section className="p2b-venues" aria-label="Places to check">
      <p className="p2b-eyebrow">Before it recommends these</p>
      <p className="p2b-venues-copy">
        {venues.length === 1
          ? 'One place the article would send a reader.'
          : `${venues.length} places the article would send a reader.`}{' '}
        Research confirmed they exist. It cannot tell whether they are still
        going.
      </p>

      <ul className="p2b-venue-list">
        {venues.map(venue => (
          <Venue
            key={venue.claim_id}
            runId={runId}
            venue={venue}
            onChanged={onChanged}
            onSettled={refreshCosts}
          />
        ))}
      </ul>

      <div className="p2b-intake-actions">
        <button type="button" className="p2b-secondary" onClick={() => setSkipped(true)}>
          These all look fine
        </button>
      </div>
    </section>
  )
}
