import { useCallback, useState } from 'react'
import type {
  ListicleAngleResult,
  ListicleCandidate,
  ListicleSearchResults,
} from '../types'
import { CandidateCard } from './CandidateCard'
import { GoogleIcon } from './LookupLinks'
import { CandidateDetails } from './CandidateDetails'
import { ConfirmRemove } from './ConfirmRemove'
import { DuplicateReview } from './DuplicateReview'
import { useCandidateBoard } from '../useCandidateBoard'
import { useGoogleChecks } from '../useGoogleChecks'

/**
 * What the searches found.
 *
 * The list is ordered by how many angles found each place. That is repeated
 * discovery and it is reported as itself: a place three searches returned has
 * been found three times, which is not the same as being the best one, and
 * nothing here has checked whether any of them is worth writing about. Ranking
 * belongs after evidence, and the evidence step is not built.
 *
 * The places come first. How they were found -- the per-search table, the
 * counts, the publications, the cut check -- is folded under one line above
 * them: it is what you open when a number looks wrong, not what you read to
 * look at the list. Anything that needs acting on (a failed search, a short
 * list, searches still running) stays outside the fold.
 *
 * Each place is a box of the same size in a grid: the name, the district, how
 * many searches found it, a checklist and a possible-duplicate warning. What
 * the searches said about it opens in a pop-up, one place at a time.
 */

interface SearchResultsProps {
  results: ListicleSearchResults
  busy: boolean
  /** Re-run some or all of the order. Named angles cost one search each. */
  onRun: (options: { angleIds?: string[]; reuse?: boolean }) => void
  /** Buy the part of the cut review nobody has done. One call per unjudged
   *  chunk; nothing at all when the pool is already covered. */
  onRecheck?: () => void
}

/** Past the free allowance, a legacy text search is billed as four SKUs:
 *  Text Search $32, Contact $3 and Atmosphere $5 per 1,000 (Basic is free),
 *  so about four cents a lookup. Checked against Google's pricing pages on
 *  2026-09-11. How much of the allowance is left comes from Google's own
 *  count -- see places_allowance.py. */
const GOOGLE_LOOKUP_USD_AFTER_FREE = 0.04

/** Why a removed place is off the list, said on its row. */
function removedBecause(
  entry: { reason?: string; kept_id: string },
  labelOf: Map<string, string>,
): string {
  switch (entry.reason) {
    case 'closed':
      return 'Google says permanently closed. Put it back if Google is wrong.'
    case 'not_a_venue':
      return "Google doesn't list it as a restaurant or bar."
    case 'by_hand':
      return 'Removed by you.'
    default:
      return `Same place as ${labelOf.get(entry.kept_id) ?? 'a place no longer on the list'}`
  }
}

const STATE_LABEL: Record<string, string> = {
  not_started: 'not run yet',
  running: 'running',
  completed: '',
  failed: 'failed',
  interrupted: 'interrupted',
}

function angleNote(angle: ListicleAngleResult): string {
  // A refresh that failed over a result that stands says so itself: the
  // server's reason names both the failure and when the standing work was
  // gathered, and prefixing it with the shown attempt's state ("completed —
  // refresh failed") reads as nonsense.
  if (angle.showing_earlier) return angle.reason
  const label = STATE_LABEL[angle.state] ?? angle.state
  if (angle.state === 'completed') return angle.reason
  return angle.reason ? `${label} — ${angle.reason}` : label
}

/** A search worth offering to run again.
 *
 *  Read off the LATEST attempt, not off the result being shown. A refresh that
 *  failed leaves a completed result on screen and is still the thing the
 *  operator wants to retry. */
function isRerunnable(angle: ListicleAngleResult): boolean {
  const latest = angle.latest_state ?? angle.state
  return latest === 'failed' || latest === 'interrupted'
}

export function SearchResults({
  results,
  busy,
  onRun,
  onRecheck,
}: SearchResultsProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const closeDetails = useCallback(() => setOpenId(null), [])
  const opened = results.candidates.find(candidate => candidate.candidate_id === openId)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const closeReview = useCallback(() => setReviewId(null), [])
  // What the operator decided about duplicates, laid over what the searches
  // found. The results themselves never change because of it.
  const {
    board,
    saving,
    error: boardError,
    resolve,
    restore,
    remove,
    replace: replaceBoard,
  } = useCandidateBoard(results.run_id)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const closeConfirm = useCallback(() => setConfirmId(null), [])
  const byId = new Map(results.candidates.map(candidate => [candidate.candidate_id, candidate]))
  const removedIds = new Set(board.removed.map(entry => entry.candidate_id))
  const distinct = new Set(board.distinct_pairs.map(([one, other]) => `${one}|${other}`))
  const judgedDifferent = (one: string, other: string) =>
    distinct.has(one < other ? `${one}|${other}` : `${other}|${one}`)
  // The duplicates still open against a place: flagged, still on the board,
  // and not already judged to be a different place.
  const openDuplicates = (candidate: ListicleCandidate): ListicleCandidate[] =>
    (candidate.possible_duplicate_ids ?? [])
      .filter(id => !removedIds.has(id) && !judgedDifferent(candidate.candidate_id, id))
      .map(id => byId.get(id))
      .filter((other): other is ListicleCandidate => Boolean(other))
  const onBoard = results.candidates.filter(candidate => !removedIds.has(candidate.candidate_id))
  const removed = board.removed
    .map(entry => ({ entry, candidate: byId.get(entry.candidate_id) }))
    .filter(
      (item): item is { entry: (typeof board.removed)[number]; candidate: ListicleCandidate } =>
        Boolean(item.candidate),
    )
  const reviewing = reviewId ? byId.get(reviewId) : undefined
  // What Google said. Only places still on the board are worth paying to
  // look up, and only those Google has not already answered for.
  const google = useGoogleChecks(results.run_id)
  const answered = (id: string) => ['found', 'not_found'].includes(google.checks[id]?.status ?? '')
  const toCheck = onBoard.filter(candidate => !answered(candidate.candidate_id))
  const onBoardChecks = onBoard.map(candidate => google.checks[candidate.candidate_id]).filter(Boolean)
  const closedCount = onBoardChecks.filter(check => check?.business_status === 'CLOSED_PERMANENTLY').length
  const notFoundCount = onBoardChecks.filter(check => check?.status === 'not_found').length
  const failedCount = onBoardChecks.filter(check => check?.status === 'failed').length
  // A check can take permanently closed places off the board, so the board
  // the check returns replaces the one on screen.
  const runGoogleCheck = async () => {
    const updated = await google.check()
    if (updated) replaceBoard(updated)
  }
  const putBack = async (candidateId: string, reason?: string) => {
    const restored = await restore(candidateId)
    // Putting back a place Google flagged overrules Google; the server has
    // recorded that, and the card follows without another read.
    if (restored && reason === 'closed') google.dismiss(candidateId, 'closed_dismissed')
    if (restored && reason === 'not_a_venue') google.dismiss(candidateId, 'venue_dismissed')
  }
  const confirming = confirmId ? byId.get(confirmId) : undefined
  const removeByHand = async () => {
    if (!confirmId) return
    if (await remove(confirmId, 'by_hand')) setConfirmId(null)
  }
  const countOf = (reason: string) =>
    removed.filter(({ entry }) => (entry.reason ?? 'duplicate') === reason).length
  const removedSummary = [
    [countOf('duplicate'), 'duplicate', 'duplicates'],
    [countOf('closed'), 'permanently closed on Google', 'permanently closed on Google'],
    [countOf('not_a_venue'), 'not a restaurant or bar', 'not restaurants or bars'],
    [countOf('by_hand'), 'removed by you', 'removed by you'],
  ]
    .filter(([count]) => (count as number) > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
    .join(', ')
  const short = results.shortfall > 0
  const rerunnable = results.angles.filter(isRerunnable)
  // Work that stands under a refresh that did not. Both facts are true at
  // once, and the version this replaced could only store one of them — the
  // failure overwrote the successful attempt it was meant to replace, and the
  // places it had found were gone.
  const failedRefreshes = results.angles.filter(angle => angle.showing_earlier)
  const unrun = results.angles.filter(angle => angle.state === 'not_started')
  // A finished search that returned no place the others missed. Every one of
  // these was paid for. In run 33fca394 two of seven were like this and
  // nothing anywhere said so — the numbers were in the table and the sentence
  // was not.
  const emptyHanded = results.angles.filter(
    angle => angle.state === 'completed' && angle.exclusive === 0,
  )
  // How to name a row when pointing at it from another row. Two candidates
  // are allowed to share a name -- that is exactly the pair worth pointing at
  // -- so "might be the same place as Casa Republicana" printed on a row
  // called Casa Republicana says nothing. The district is what separates them,
  // and where it does not, its absence is the difference.
  const labelOf = new Map(
    results.candidates.map(candidate => [
      candidate.candidate_id,
      candidate.district
        ? `${candidate.name} (${candidate.district})`
        : `${candidate.name} (no district given)`,
    ]),
  )
  // Deduplicated across every angle: the same paper cited by three searches is
  // one publication, not three.
  const sourcesNamed = [
    ...new Set(results.angles.flatMap(angle => angle.sources_named ?? [])),
  ].sort()

  return (
    <section className="lp-results" aria-label="What the searches found">
      <header className="lp-results-head">
        <p className="lp-results-score">
          <strong>{onBoard.length}</strong> places found
          <span className="lp-muted"> of {results.target} wanted</span>
        </p>
        {removed.length > 0 && (
          <p className="lp-muted lp-results-sub">
            {removed.length} taken off the list: {removedSummary}. They are at the bottom
            of the list and can be put back.
          </p>
        )}
        {/* Google, on request. Billed per place, so the button says how
            many and roughly what it costs before anything is asked. */}
        <div className="lp-google-bar">
          {toCheck.length > 0 ? (
            <>
              <button
                type="button"
                className="lp-tool"
                disabled={google.checking}
                onClick={() => void runGoogleCheck()}
              >
                <GoogleIcon />
                {google.checking
                  ? `Checking ${toCheck.length} places on Google…`
                  : `Check ${toCheck.length} ${toCheck.length === 1 ? 'place' : 'places'} on Google`}
              </button>
              <span className="lp-muted">Is it open, what kind of place, rating and price.</span>
            </>
          ) : (
            <span className="lp-muted">Every place on the list has been checked on Google.</span>
          )}
          {onBoardChecks.length > 0 && (closedCount > 0 || notFoundCount > 0 || failedCount > 0) && (
            <span className="lp-google-summary">
              {[
                closedCount > 0 && `${closedCount} permanently closed`,
                notFoundCount > 0 && `${notFoundCount} not found on Google`,
                failedCount > 0 && `${failedCount} couldn't be checked`,
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          )}
        </div>
        {/* The countdown. Google's count, across every app on the key, so it
            is the number that decides whether a check is free. */}
        {google.allowance && (
          <p className="lp-allowance">
            {google.allowance.available && google.allowance.left !== undefined ? (
              <>
                <strong>{google.allowance.left.toLocaleString()}</strong> of{' '}
                {google.allowance.free.toLocaleString()} free Google lookups left this month
                <span className="lp-muted">
                  {' '}
                  (all your apps count; Google's number runs a few minutes behind)
                </span>
              </>
            ) : (
              <span className="lp-muted">
                {google.allowance.reason ?? "Google's count could not be read."} Don't
                assume the check is free.
              </span>
            )}
          </p>
        )}
        {google.allowance?.available &&
          google.allowance.left !== undefined &&
          toCheck.length > google.allowance.left && (
            <p className="lp-results-short" role="status">
              Checking {toCheck.length} places uses more than the{' '}
              {google.allowance.left.toLocaleString()} free lookups left. The other{' '}
              {toCheck.length - google.allowance.left} cost about $
              {GOOGLE_LOOKUP_USD_AFTER_FREE.toFixed(2)} each, about $
              {((toCheck.length - google.allowance.left) * GOOGLE_LOOKUP_USD_AFTER_FREE).toFixed(2)}{' '}
              in all.
            </p>
          )}
        {google.error && (
          <p className="lp-error" role="alert">
            {google.error}
          </p>
        )}
        {boardError && !reviewing && (
          <p className="lp-error" role="alert">
            {boardError}
          </p>
        )}
        {failedRefreshes.length > 0 && (
          <p className="lp-results-short" role="status">
            {failedRefreshes.length === 1
              ? 'One search failed to refresh. Its earlier result is still shown below, with the time it was gathered.'
              : `${failedRefreshes.length} searches failed to refresh. Their earlier results are still shown below, with the time each was gathered.`}
          </p>
        )}
        {short && (
          <p className="lp-results-short" role="status">
            {results.shortfall} short. Add an angle, or take the shorter list.
          </p>
        )}
        {results.capacity_warning && (
          <p className="lp-results-short" role="status">
            {results.capacity_warning}
          </p>
        )}
        {results.running && (
          <p className="lp-muted" role="status">
            Searches are still running for this order. This is what has finished
            so far.
          </p>
        )}
      </header>

      <details className="lp-results-how">
        <summary>
          How these were found · {results.angles.length}{' '}
          {results.angles.length === 1 ? 'search' : 'searches'}
        </summary>
        <div className="lp-results-how-body">
          <p className="lp-muted lp-results-sub">
            {results.rows_returned} results across {results.angles.length} searches,{' '}
            {Math.max(0, results.rows_returned - results.found)} of them the same place
            found more than once
          </p>
          {/* A distinct count is provisional while any two rows might be one
              venue. Printing one number without saying so implies a certainty
              this step has not got. */}
          {results.uncertain_identity > 0 && (
            <p className="lp-muted lp-results-sub">
              {results.uncertain_identity}{' '}
              {results.uncertain_identity === 1 ? 'entry has' : 'entries have'} a
              possible duplicate beside {results.uncertain_identity === 1 ? 'it' : 'them'},
              so this count is provisional.
            </p>
          )}
          {emptyHanded.length > 0 && (
            <p className="lp-muted lp-results-sub">
              {emptyHanded.length} of {results.angles.length} searches returned no
              place the others missed. Not wasted by definition — a search with
              nothing exclusive may be the coverage the rest are being checked
              against — but each one was paid for.
            </p>
          )}
          {/* A correction changed what the searches ask for, so the research
              that exists answered the previous request. Saying so is the
              difference between "your research is gone" and "your research
              answered a different question". */}
          {(results.superseded_results ?? 0) > 0 && (
            <p className="lp-muted lp-results-sub">
              {results.superseded_results} earlier{' '}
              {results.superseded_results === 1 ? 'search is' : 'searches are'}{' '}
              still stored for this run and no longer{' '}
              {results.superseded_results === 1 ? 'answers' : 'answer'} the order
              as it stands — a correction changed what they ask for. They are
              kept under the revision they were bought for.
            </p>
          )}
          {results.legacy && (
            <p className="lp-muted lp-results-sub" role="status">
              Stored before this pipeline recorded work per search, so individual
              searches cannot be re-run from here.
            </p>
          )}
          {/* Where the searches actually looked. The citation URLs are opaque
              Google redirects, so this list is the only thing that can answer
              "did it read local sources or only the visitor guides". */}
          {sourcesNamed.length > 0 && (
            <details className="lp-sources">
              <summary>
                {sourcesNamed.length} publications behind these results
              </summary>
              <p className="lp-sources-list">{sourcesNamed.join(' · ')}</p>
            </details>
          )}

          <table className="lp-angle-table">
            <thead>
              <tr>
                <th scope="col">Returned</th>
                <th scope="col">Search</th>
                <th scope="col">Shared</th>
                <th scope="col">Only this</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {results.angles.map(angle => (
                <tr
                  key={angle.angle_id || angle.angle}
                  className={
                    angle.failed
                      ? 'lp-angle-failed'
                      : angle.showing_earlier
                        ? 'lp-angle-stale'
                        : undefined
                  }
                >
                  <td className="lp-angle-count">{angle.rows}</td>
                  <td>
                    {angle.angle}
                    <span className="lp-angle-tags">
                      <span className="lp-picker-role">{angle.role}</span>
                      {angle.reused && angle.gathered_at && (
                        <span className="lp-muted" title={angle.gathered_at}>
                          reused from earlier research
                        </span>
                      )}
                    </span>
                  </td>
                  {/* Contribution, against the whole pool. Calculated after every
                      search finished, so reordering them cannot change it. */}
                  <td className="lp-angle-count lp-muted">{angle.shared}</td>
                  <td className="lp-angle-count">{angle.exclusive}</td>
                  <td className="lp-muted lp-angle-note">
                    {/* A search that broke and a search that found nothing are
                        different findings, and only one of them is worth
                        re-running. */}
                    {angleNote(angle)}
                    {(isRerunnable(angle) || angle.state === 'not_started') && (
                      <button
                        type="button"
                        className="lp-link-button"
                        disabled={busy}
                        onClick={() => onRun({ angleIds: [angle.angle_id], reuse: false })}
                      >
                        run this one
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* The cut is composed into every search prompt and the model does not
              reliably obey it. Run 33fca394 returned eight Nikkei and Japanese
              restaurants against an explicit "no places where ceviche is not the
              primary offering". Nothing here checks them, and a list presented
              without saying so reads as though something did.

              Not solved with more prompt text -- that was already tried and is
              what produced the eight. Checking a place against the cut is a
              judgement about that place, and it is not built. `gate.assess` does
              not do it either: it weighs whether enough is published about a
              place, and every one of those eight is written about constantly. */}
          {results.order.exclusions && results.candidates.length > 0 && (
            <CutReviewNote results={results} busy={busy} onRecheck={onRecheck} />
          )}
        </div>
      </details>

      <ol className="lp-candidates">
        {onBoard.map(candidate => {
          const open = openDuplicates(candidate)
          // A stored result from before candidates had ids names its
          // duplicates and cannot point at them, so its warning stays a note.
          const legacyNames =
            !(candidate.possible_duplicate_ids ?? []).length &&
            candidate.possible_duplicates.length > 0
          return (
            // Keyed on the candidate's own id. Two rows may legitimately carry
            // the same name in the same district — that is exactly the pair
            // the pipeline refuses to merge — and a key built from those
            // collides.
            <CandidateCard
              key={candidate.candidate_id}
              candidate={candidate}
              place={results.order.place}
              duplicates={
                legacyNames
                  ? candidate.possible_duplicates
                  : open.map(other => labelOf.get(other.candidate_id) ?? other.name)
              }
              onDetails={() => setOpenId(candidate.candidate_id)}
              onReviewDuplicates={
                open.length > 0 ? () => setReviewId(candidate.candidate_id) : undefined
              }
              google={google.checks[candidate.candidate_id]}
              onRemove={() => setConfirmId(candidate.candidate_id)}
              onRemoveNotAVenue={() => void remove(candidate.candidate_id, 'not_a_venue')}
            />
          )
        })}
      </ol>

      {/* Off the board, not deleted. A wrong call is one click to undo, which
          is the whole reason removing is not deleting. */}
      {removed.length > 0 && (
        <details className="lp-removed">
          <summary>Removed places ({removed.length})</summary>
          <ul className="lp-removed-list">
            {removed.map(({ entry, candidate }) => (
              <li key={entry.candidate_id} className="lp-removed-row">
                <span>
                  <span className="lp-removed-name">
                    {labelOf.get(candidate.candidate_id) ?? candidate.name}
                  </span>
                  <span className="lp-muted">
                    {' '}
                    {removedBecause(entry, labelOf)}
                  </span>
                </span>
                <button
                  type="button"
                  className="lp-tool lp-tool-quiet"
                  disabled={saving}
                  aria-label={`Put back ${candidate.name}`}
                  onClick={() => void putBack(entry.candidate_id, entry.reason)}
                >
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {confirming && (
        <ConfirmRemove
          candidate={confirming}
          saving={saving}
          onConfirm={() => void removeByHand()}
          onClose={closeConfirm}
        />
      )}

      {reviewing && (
        <DuplicateReview
          candidate={reviewing}
          others={openDuplicates(reviewing)}
          place={results.order.place}
          saving={saving}
          error={boardError}
          onSave={resolve}
          onClose={closeReview}
        />
      )}

      {opened && (
        <CandidateDetails
          candidate={opened}
          partialCutReview={
            Boolean(results.order.exclusions) && results.cut_review_status === 'partial'
          }
          onClose={closeDetails}
        />
      )}

      <div className="lp-actions">
        {rerunnable.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onRun({ angleIds: rerunnable.map(angle => angle.angle_id), reuse: false })
            }
          >
            {busy
              ? 'Searching…'
              : `Retry ${rerunnable.length} failed ${
                  rerunnable.length === 1 ? 'search' : 'searches'
                }`}
          </button>
        )}
        {unrun.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRun({})}
          >
            {busy ? 'Searching…' : `Run ${unrun.length} remaining`}
          </button>
        )}
        <button
          type="button"
          className="lp-secondary"
          onClick={() => onRun({ reuse: false })}
          disabled={busy}
        >
          {busy ? 'Searching…' : 'Search everything again'}
        </button>
      </div>
      <p className="lp-muted lp-results-sub">
        Searching everything again buys new research for every angle. Retrying one
        search costs one search &mdash; and a search that was interrupted may have
        been charged already.
      </p>
    </section>
  )
}


/** What the cut check did, said as one of the several things it can be.
 *
 *  There used to be two readings — checked, or nobody looked — and four states
 *  underneath them. A pool of 121 candidates was truncated at 120 and reported
 *  as checked; a review that failed over a refreshed pool left the new venues
 *  reading as checked and clean. Every one of those says "we looked and it is
 *  fine", which is the one thing this step must never say falsely. */
function CutReviewNote({
  results,
  busy,
  onRecheck,
}: {
  results: ListicleSearchResults
  busy: boolean
  onRecheck?: () => void
}) {
  const status = results.cut_review_status ?? (results.cut_checked ? 'complete' : 'not_checked')
  const reviewed = results.cut_reviewed_count ?? 0
  const expected = results.cut_expected_count ?? results.candidates.length

  if (status === 'not_needed') {
    return (
      <p className="lp-results-unchecked" role="status">
        Nothing was barred, so there was nothing to check these against.
      </p>
    )
  }

  if (status === 'complete') {
    return (
      <p className="lp-results-unchecked" role="status">
        {results.barred_count
          ? `${results.barred_count} of these look like places you left out — marked below. Judged from what the searches themselves reported, not from a fresh look at each place, so check before dropping any.`
          : 'Checked against what you left out; none of these looked barred. That is a reading of what the searches reported, not a verification of the places.'}
      </p>
    )
  }

  if (status === 'partial') {
    return (
      <p className="lp-results-unchecked" role="status">
        {reviewed} of {expected} checked against what you left out. The rest
        were never looked at, and an unchecked row below says so rather than
        reading as one that came back clean.
        {onRecheck && (
          <>
            {' '}
            <button
              type="button"
              className="lp-link-button"
              disabled={busy}
              onClick={onRecheck}
            >
              check the remaining {expected - reviewed}
            </button>
            {results.cut_missing_chunks?.length
              ? ` — ${results.cut_missing_chunks.length} more call${
                  results.cut_missing_chunks.length === 1 ? '' : 's'
                }.`
              : '.'}
          </>
        )}
      </p>
    )
  }

  return (
    <p className="lp-results-unchecked" role="status">
      Nothing below has been checked against what you left out. The rule went
      to every search; whether a place breaks it is not something this step
      decides.
      {results.cut_historical && (
        <>
          {' '}
          An earlier check of this run is still stored. It was filed by name,
          under different pooling rules, so it cannot be applied to these rows
          — it is kept as a record rather than shown as a verdict.
        </>
      )}
      {onRecheck && (
        <>
          {' '}
          <button
            type="button"
            className="lp-link-button"
            disabled={busy}
            onClick={onRecheck}
          >
            check them now
          </button>
          {results.cut_chunks_planned
            ? ` — ${results.cut_chunks_planned} call${
                results.cut_chunks_planned === 1 ? '' : 's'
              }.`
            : '.'}
        </>
      )}
    </p>
  )
}
