import type {
  ListicleAngleResult,
  ListicleCandidate,
  ListicleSearchResults,
} from '../types'

/**
 * What the searches found.
 *
 * The list is ordered by how many angles found each place. That is repeated
 * discovery and it is reported as itself: a place three searches returned has
 * been found three times, which is not the same as being the best one, and
 * nothing here has checked whether any of them is worth writing about. Ranking
 * belongs after evidence, and the evidence step is not built.
 *
 * The per-angle table is above the list on purpose. When the count falls short
 * the question is always "which search failed", and an angle that returned
 * nothing is the answer. Each row now says what the angle contributed as well
 * as what it returned: how much of its haul other angles found too, and how
 * much only it found. A search with few exclusive names is not thereby useless
 * -- it may be the coverage everything else is being checked against.
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
          <strong>{results.found}</strong> places found
          <span className="lp-muted"> of {results.target} wanted</span>
        </p>
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
        {failedRefreshes.length > 0 && (
          <p className="lp-results-short" role="status">
            {failedRefreshes.length === 1
              ? 'One search failed to refresh. Its earlier result is still shown below, with the time it was gathered.'
              : `${failedRefreshes.length} searches failed to refresh. Their earlier results are still shown below, with the time each was gathered.`}
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
        {results.legacy && (
          <p className="lp-muted" role="status">
            Stored before this pipeline recorded work per search, so individual
            searches cannot be re-run from here.
          </p>
        )}
      </header>

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

      <ol className="lp-candidates">
        {results.candidates.map(candidate => (
          // Keyed on the candidate's own id. Two rows may legitimately carry
          // the same name in the same district — that is exactly the pair the
          // pipeline refuses to merge — and a key built from those collides.
          <li key={candidate.candidate_id} className="lp-candidate">
            <div className="lp-candidate-line">
              <span className="lp-candidate-name">{candidate.name}</span>
              {candidate.district && (
                <span className="lp-muted lp-candidate-district">{candidate.district}</span>
              )}
              {candidate.overlap > 1 && (
                <span className="lp-candidate-overlap" title={candidate.found_by.join('\n')}>
                  found by {candidate.overlap} searches
                </span>
              )}
            </div>
            {candidate.evidence && (
              <p className="lp-candidate-evidence">{candidate.evidence}</p>
            )}
            {/* Every row as a search returned it. Two angles found this place
                for two different reasons, and the reasons are what a person
                needs to check whether it is one place. */}
            {candidate.sightings.length > 1 && (
              <ul className="lp-candidate-sightings">
                {candidate.sightings.map((sighting, index) => (
                  <li key={sighting.sighting_id ?? index}>
                    <span className="lp-muted">{sighting.angle}:</span> {sighting.name}
                    {sighting.evidence ? ` — ${sighting.evidence}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {/* Shown rather than resolved. This step cannot tell a second
                branch from a second spelling, and folding them together loses
                a venue with nothing on screen to notice. */}
            {/* Flagged, never removed.

                Both levels read as "look at this", not as a verdict. Measured
                on real data: which places get flagged is stable across runs,
                but whether one comes back `clear` or `arguable` is not -- the
                same 43 candidates produced 13/13/11 flags over three calls
                with the split moving each time. The reason underneath is the
                substance; the level is only a rough ordering. */}
            {candidate.barred && (
              <p
                className={
                  candidate.barred_confidence === 'clear'
                    ? 'lp-candidate-barred'
                    : 'lp-candidate-barred lp-candidate-barred-arguable'
                }
              >
                {candidate.barred_confidence === 'clear'
                  ? 'Looks like something you left out'
                  : 'Might be something you left out'}
                : {candidate.barred}
              </p>
            )}
            {/* A partial review leaves rows nobody looked at. Said on the row,
                because the alternative is a place that reads as having
                survived a check it was never part of. */}
            {results.order.exclusions &&
              results.cut_review_status === 'partial' &&
              candidate.cut_reviewed === false && (
                <p className="lp-candidate-unchecked">
                  Not checked against what you left out.
                </p>
              )}
            {candidate.possible_duplicates.length > 0 && (
              <p className="lp-candidate-duplicate">
                Might be the same place as{' '}
                {namesOfDuplicates(candidate, labelOf).join(', ')}.
              </p>
            )}
          </li>
        ))}
      </ol>

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


/** The rows this one might be a duplicate of, named so they can be told apart.
 *
 *  By id where there is one, because two candidates may carry the same name and
 *  the whole point of the label is to send the reader to the OTHER row. The
 *  names are the fallback for a stored result from before candidates had ids. */
function namesOfDuplicates(
  candidate: ListicleCandidate,
  labelOf: Map<string, string>,
): string[] {
  const byId = (candidate.possible_duplicate_ids ?? [])
    .map(id => labelOf.get(id))
    .filter((label): label is string => Boolean(label))
  return byId.length > 0 ? byId : candidate.possible_duplicates
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
