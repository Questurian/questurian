import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { AttentionPanel } from './AttentionPanel'
import { DayArticle, Link, endpointLabel, legWords, safeHref } from './DayArticle'
import { Badge, Step } from './Step'
import { attentionFor, openCountByLabel, stopNames } from './attention'
import type { DayResult, DaySlotView, SavedResultView } from '../../dayWork/types'

/**
 * The saved day, read as a day — "here is your day" first.
 *
 * Three plain status lines come before anything else, because they are three
 * different facts that used to blur into one: the day is **saved**; it is or
 * is not **complete for planning**; and its **sources** have or have not been
 * read by a person. Then the title and introduction, then anything that keeps
 * the day open, then the places in order.
 *
 * Suggestions and caveats are folded under the blocking list rather than
 * mixed into it. Reference material — every journey, every source, earlier
 * versions and the raw answer — sits at the bottom, closed.
 *
 * A compact answer was turned into this saved shape by the app. The raw view
 * says which object it shows, and the status line never presents the app's
 * derived status as the model's own verdict.
 */

const STATUS_WORDS: Record<string, string> = {
  ready_for_editor_review: 'the model called it ready for review',
  needs_decision: 'the model wants a decision from you',
  insufficient_evidence: 'the model says it did not find enough',
}

const DERIVED_STATUS_WORDS: Record<string, string> = {
  ready_for_editor_review: 'it raised no blocking issue',
  needs_decision: 'it raised something that needs your decision',
  insufficient_evidence: 'it could not resolve any stop',
}

function statusWords(result: DayResult): string {
  if (result.wireVersion) {
    return `the app marked it this way because ${DERIVED_STATUS_WORDS[result.status] ?? 'of what it returned'}`
  }
  return STATUS_WORDS[result.status] ?? 'the model gave its own verdict'
}

function browsingWords(result: DayResult): string | null {
  const basis = result.research.browsingBasis ?? 'model'
  if (basis === 'unknown') {
    return 'The app did not run this research, so it cannot tell whether any page was read.'
  }
  if (!result.research.browsingUsed) {
    return basis === 'tool_calls'
      ? 'The run made no web searches and read no pages.'
      : 'The model says it did not browse.'
  }
  return null
}

/** An ISO timestamp as a reader would say it. Falls back to the raw text. */
export function whenWords(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export interface DayResultViewProps {
  saved: SavedResultView
  slots: DaySlotView[]
  /** Why each stop is in the day, by slot id. */
  roles: Map<string, string>
  history: Array<{
    result_revision: number
    saved_at: string
    title: string
    complete: boolean
  }>
  review: { notes: string; evidence_reviewed: boolean }
  busy: boolean
  onSaveReview: (notes: string, evidenceReviewed: boolean) => void
}

export function DayResultView({
  saved,
  slots,
  roles,
  history,
  review,
  busy,
  onSaveReview,
}: DayResultViewProps) {
  const result = saved.result
  const completeness = saved.report.completeness
  const names = stopNames(result, slots)
  const attention = attentionFor(result, saved.report, names)
  const openByLabel = openCountByLabel(attention.blocking, names)
  const browsing = browsingWords(result)
  const compact = Boolean(result.wireVersion)
  const blockingCount = attention.blocking.length

  const [notes, setNotes] = useState(review.notes)
  const [checked, setChecked] = useState(review.evidence_reviewed)

  // A newly saved result is a new thing to review, so the boxes follow what the
  // server holds rather than keeping whatever was typed against the last one.
  useEffect(() => {
    setNotes(review.notes)
    setChecked(review.evidence_reviewed)
  }, [review.notes, review.evidence_reviewed, saved.result_revision])

  const dirty = notes !== review.notes || checked !== review.evidence_reviewed
  const hasLegacyFeasibility = result.feasibility.some(entry => entry.status !== 'unresolved')
  const selected = result.stops.filter(stop => stop.status === 'selected').length

  return (
    <Step
      id="ip-result"
      title="Your day"
      tone="result"
      badge={
        completeness.complete ? (
          <Badge tone="done">
            <Check size={12} aria-hidden /> Complete for planning
          </Badge>
        ) : (
          <Badge tone="warning">Needs work</Badge>
        )
      }
    >
      <DayArticle
        result={result}
        slots={slots}
        roles={roles}
        openByLabel={openByLabel}
        subline={
          <p className="ip-helper">
            {selected} of {result.stops.length} stops chosen
            {result.scheduleLabel ? ` · ${result.scheduleLabel}` : ''}
          </p>
        }
        afterHead={
          <>
            <dl className="ip-day-status">
              <div>
                <dt>Saved</dt>
                <dd>
                  <span className="ip-status-dot ip-status-dot-done" aria-hidden />
                  Version {saved.result_revision}, {whenWords(saved.saved_at)}
                </dd>
              </div>
              <div>
                <dt>Planning</dt>
                <dd>
                  <span
                    className={
                      completeness.complete
                        ? 'ip-status-dot ip-status-dot-done'
                        : 'ip-status-dot ip-status-dot-open'
                    }
                    aria-hidden
                  />
                  {completeness.complete
                    ? 'Every stop is resolved and timed, and the journeys fit. Its facts are still unchecked.'
                    : `Not complete for planning — ${blockingCount} thing${blockingCount === 1 ? '' : 's'} still open, listed below.`}
                </dd>
              </div>
              <div>
                <dt>Sources</dt>
                <dd>
                  <span
                    className={
                      review.evidence_reviewed
                        ? 'ip-status-dot ip-status-dot-done'
                        : 'ip-status-dot'
                    }
                    aria-hidden
                  />
                  <span>
                    {review.evidence_reviewed ? (
                      <>You marked the sources as read. The app only checked that the references resolve; {statusWords(result)}.</>
                    ) : (
                      <>
                        Nothing below has been checked against its sources. The references
                        resolve — that is all the app can tell you — and {statusWords(result)}.
                      </>
                    )}
                    {browsing ? ` ${browsing}` : ''}
                  </span>
                </dd>
              </div>
            </dl>

            <AttentionPanel
              attention={attention}
              headingId="ip-attention-heading"
              savedWord="stays saved"
            />
          </>
        }
      />

      <section className="ip-review-notes" aria-labelledby="ip-review-heading">
        <h4 className="ip-section-title" id="ip-review-heading">
          Your review
        </h4>
        <p className="ip-helper">
          A record of what you checked. It is kept beside the day and changes
          nothing in it — not the places, not the planning status.
        </p>
        <label className="ip-check" htmlFor="ip-reviewed">
          <input
            id="ip-reviewed"
            type="checkbox"
            checked={checked}
            onChange={event => setChecked(event.target.checked)}
          />
          <span>
            I have read the sources myself. Until you tick this, the day stays
            marked unchecked. Ticking it does not make the day complete.
          </span>
        </label>
        <label className="ip-sr-only" htmlFor="ip-review-notes">
          Review notes
        </label>
        <textarea
          id="ip-review-notes"
          rows={3}
          value={notes}
          placeholder="What you checked, what you changed your mind about, what still worries you."
          onChange={event => setNotes(event.target.value)}
        />
        <div className="ip-step-actions">
          <button
            type="button"
            className="ip-button-primary"
            disabled={busy || !dirty}
            onClick={() => onSaveReview(notes, checked)}
          >
            Save my review
          </button>
          <span className="ip-helper">{dirty ? 'Not saved yet.' : 'Up to date.'}</span>
        </div>
      </section>

      <section className="ip-reference" aria-labelledby="ip-reference-heading">
        <h4 className="ip-section-title" id="ip-reference-heading">
          Reference
        </h4>
        <p className="ip-helper">For checking details. Nothing here needs action.</p>

        {hasLegacyFeasibility ? (
          <details className="ip-disclosure">
            <summary>
              Does it hold together?{' '}
              <span className="ip-disclosure-note">
                {result.feasibility.length} checks the model made
              </span>
            </summary>
            <ul className="ip-evidence">
              {result.feasibility.map((entry, index) => (
                <li key={`${entry.topic}-${index}`}>
                  <p className="ip-evidence-claim">
                    <strong>{entry.topic}</strong> — {entry.status.replace('_', ' ')}
                  </p>
                  <p className="ip-evidence-cite">{entry.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {result.transfers.length > 0 ? (
          <details className="ip-disclosure">
            <summary>
              Every journey{' '}
              <span className="ip-disclosure-note">{result.transfers.length} legs</span>
            </summary>
            <ul className="ip-evidence">
              {result.transfers.map((leg, index) => (
                <li key={`${leg.from}-${leg.to}-${index}`}>
                  <p className="ip-evidence-claim">
                    {endpointLabel(leg.from, names.labels)} →{' '}
                    {endpointLabel(leg.to, names.labels)} · {legWords(leg)}
                  </p>
                  {leg.note ? <p className="ip-evidence-cite">{leg.note}</p> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {result.sources.length > 0 ? (
          <details className="ip-disclosure">
            <summary>
              Every source it cites{' '}
              <span className="ip-disclosure-note">{result.sources.length} unchecked</span>
            </summary>
            <ul className="ip-evidence">
              {result.sources.map(source => (
                <li key={source.id}>
                  <p className="ip-evidence-claim">
                    <Link href={safeHref(source.url)}>{source.title || source.url}</Link>
                  </p>
                  <p className="ip-evidence-cite">
                    {source.publisher}
                    {compact ? '' : ` · ${source.sourceType}`}
                    {source.accessedAt ? ` · read ${source.accessedAt}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {history.length > 1 ? (
          <details className="ip-disclosure">
            <summary>
              Earlier versions{' '}
              <span className="ip-disclosure-note">{history.length} saved</span>
            </summary>
            <ul className="ip-agenda-list">
              {history.map(row => (
                <li key={row.result_revision}>
                  {row.result_revision === saved.result_revision ? 'Now: ' : ''}
                  {row.title || 'untitled'} · {row.saved_at}
                  {row.complete ? '' : ' · needs work'}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {compact && saved.returned_raw ? (
          <details className="ip-raw ip-disclosure">
            <summary>
              What the model returned{' '}
              <span className="ip-disclosure-note">the compact answer, as it arrived</span>
            </summary>
            <pre>{saved.returned_raw}</pre>
          </details>
        ) : null}
        <details className="ip-raw ip-disclosure">
          <summary>
            {compact ? 'The saved object' : 'The raw JSON'}{' '}
            <span className="ip-disclosure-note">
              {compact
                ? 'built by the app from that answer — ids, map links and status are the app’s'
                : 'as it was returned'}
            </span>
          </summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      </section>
    </Step>
  )
}
