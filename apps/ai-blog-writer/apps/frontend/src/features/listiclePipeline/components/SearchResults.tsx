import type { ListicleAngleResult, ListicleSearchResults } from '../types'

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
}

const STATE_LABEL: Record<string, string> = {
  not_started: 'not run yet',
  running: 'running',
  completed: '',
  failed: 'failed',
  interrupted: 'interrupted',
}

function angleNote(angle: ListicleAngleResult): string {
  const label = STATE_LABEL[angle.state] ?? angle.state
  if (angle.state === 'completed') return angle.reason
  return angle.reason ? `${label} — ${angle.reason}` : label
}

export function SearchResults({ results, busy, onRun }: SearchResultsProps) {
  const short = results.shortfall > 0
  const rerunnable = results.angles.filter(
    angle => angle.state === 'failed' || angle.state === 'interrupted',
  )
  const unrun = results.angles.filter(angle => angle.state === 'not_started')
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
              className={angle.failed ? 'lp-angle-failed' : undefined}
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
                {(angle.state === 'failed' ||
                  angle.state === 'interrupted' ||
                  angle.state === 'not_started') && (
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

      <ol className="lp-candidates">
        {results.candidates.map(candidate => (
          <li key={`${candidate.name}-${candidate.district}`} className="lp-candidate">
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
                  <li key={index}>
                    <span className="lp-muted">{sighting.angle}:</span> {sighting.name}
                    {sighting.evidence ? ` — ${sighting.evidence}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {/* Shown rather than resolved. This step cannot tell a second
                branch from a second spelling, and folding them together loses
                a venue with nothing on screen to notice. */}
            {candidate.possible_duplicates.length > 0 && (
              <p className="lp-candidate-duplicate">
                Might be the same place as {candidate.possible_duplicates.join(', ')}.
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
