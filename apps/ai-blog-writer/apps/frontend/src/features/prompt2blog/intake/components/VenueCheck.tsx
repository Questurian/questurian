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
}: {
  runId: string
  venue: VenueToCheck
  onChanged: () => void
}) {
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState(venue.note)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'dropped' | 'noted' | null>(null)

  async function send(body: { drop?: boolean; note?: string }) {
    setBusy(true)
    try {
      await markVenue(runId, { claim_id: venue.claim_id, ...body })
      setDone(body.drop ? 'dropped' : 'noted')
      onChanged()
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
          {done === 'dropped' ? 'Dropped. It will not reach the writer.' : `Noted: ${note}`}
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
              onClick={() => void send({ note })}
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
        <div className="p2b-intake-actions">
          <button
            type="button"
            className="p2b-secondary"
            onClick={() => void send({ drop: true })}
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
        </div>
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
          <Venue key={venue.claim_id} runId={runId} venue={venue} onChanged={onChanged} />
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
