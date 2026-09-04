import type { ListicleSearchResults } from '../types'

/**
 * What the searches found.
 *
 * The list is ordered by how many angles found each place, not alphabetically
 * and not by any score. A place three separate searches returned is the
 * strongest thing here, and that ordering is the only ranking the pipeline has
 * earned so far -- it comes out of the searches rather than out of a model
 * being asked which restaurant is best.
 *
 * The per-angle table is above the list on purpose. When the count falls short
 * the question is always "which search failed", and an angle that returned
 * nothing is the answer.
 */

interface SearchResultsProps {
  results: ListicleSearchResults
  busy: boolean
  onRerun: () => void
}

export function SearchResults({ results, busy, onRerun }: SearchResultsProps) {
  const short = results.shortfall > 0

  return (
    <section className="lp-results" aria-label="What the searches found">
      <header className="lp-results-head">
        <p className="lp-results-score">
          <strong>{results.found}</strong> places found
          <span className="lp-muted"> of {results.target} wanted</span>
        </p>
        <p className="lp-muted lp-results-sub">
          {results.rows_returned} results across {results.angles.length} searches,{' '}
          {results.rows_returned - results.found} of them the same place found twice
        </p>
        {short && (
          <p className="lp-results-short" role="status">
            {results.shortfall} short. Add an angle, or take the shorter list.
          </p>
        )}
      </header>

      <table className="lp-angle-table">
        <tbody>
          {results.angles.map(angle => (
            <tr key={angle.angle} className={angle.failed ? 'lp-angle-failed' : undefined}>
              <td className="lp-angle-count">{angle.rows}</td>
              <td>{angle.angle}</td>
              <td className="lp-muted lp-angle-note">
                {/* A search that broke and a search that found nothing are
                    different findings, and only one of them is worth
                    re-running. */}
                {angle.failed ? `failed — ${angle.reason}` : angle.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ol className="lp-candidates">
        {results.candidates.map(candidate => (
          <li key={candidate.name} className="lp-candidate">
            <div className="lp-candidate-line">
              <span className="lp-candidate-name">{candidate.name}</span>
              {candidate.district && (
                <span className="lp-muted lp-candidate-district">{candidate.district}</span>
              )}
              {candidate.overlap > 1 && (
                <span className="lp-candidate-overlap" title={candidate.found_by.join('\n')}>
                  found by {candidate.overlap}
                </span>
              )}
            </div>
            {candidate.evidence && (
              <p className="lp-candidate-evidence">{candidate.evidence}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="lp-actions">
        <button type="button" className="lp-secondary" onClick={onRerun} disabled={busy}>
          {busy ? 'Searching…' : 'Run the searches again'}
        </button>
      </div>
    </section>
  )
}
