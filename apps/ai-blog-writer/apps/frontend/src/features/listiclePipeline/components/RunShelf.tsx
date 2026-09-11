import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listRuns, setRunHidden } from '../api'
import type { ListicleRunSummary } from '../types'

/**
 * Every saved list, and where each one stopped.
 *
 * Runs were always stored; the only way back to one was its id in the address
 * bar. A list is worked on across days -- searched one afternoon, reviewed by
 * hand later -- so the front door has to show what is already on the go before
 * it offers to start something new.
 *
 * Hiding takes a run off this list and does nothing else. Test runs get out of
 * the way without losing what their searches cost.
 */

function stageLine(run: ListicleRunSummary): string {
  switch (run.stage) {
    case 'searched':
      return run.target
        ? `${run.found ?? 0} places found for a list of ${run.target} · next: your review`
        : `${run.found ?? 0} places found · next: your review`
    case 'searching':
      return 'Searching now…'
    case 'agreed':
      return 'Order settled · searches not run yet'
    case 'interview':
      return 'Interview not finished'
    default:
      return 'This run could not be read'
  }
}

/** The server stores UTC as `YYYY-MM-DD HH:MM:SS`, without saying so. */
function when(stamp: string): string {
  if (!stamp) return ''
  const parsed = new Date(stamp.includes('T') ? stamp : `${stamp.replace(' ', 'T')}Z`)
  if (Number.isNaN(parsed.getTime())) return stamp
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function RunShelf() {
  const [runs, setRuns] = useState<ListicleRunSummary[] | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [moving, setMoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setRuns(await listRuns(true))
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The saved lists could not be read.')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const move = async (runId: string, hidden: boolean) => {
    setMoving(runId)
    try {
      await setRunHidden(runId, hidden)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That list could not be moved.')
    } finally {
      setMoving(null)
    }
  }

  if (runs === null && !error) {
    return (
      <p className="lp-muted lp-shelf-loading" role="status">
        Reading your saved lists…
      </p>
    )
  }

  const onShelf = (runs ?? []).filter(run => !run.hidden)
  const hidden = (runs ?? []).filter(run => run.hidden)
  const shown = showHidden ? [...onShelf, ...hidden] : onShelf

  return (
    <section className="lp-shelf" aria-label="Your lists">
      <p className="lp-eyebrow">Your lists</p>
      {error && (
        <p className="lp-error" role="alert">
          {error}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="lp-muted">No saved lists yet. Start one above.</p>
      ) : (
        <ul className="lp-shelf-list">
          {shown.map(run => (
            <li
              key={run.run_id}
              className={run.hidden ? 'lp-shelf-row lp-shelf-row-hidden' : 'lp-shelf-row'}
            >
              <Link to={`/listicle-pipeline/${run.run_id}`} className="lp-shelf-open">
                <span className="lp-shelf-title">{run.seed || `Run ${run.run_id}`}</span>
                <span className="lp-shelf-stage">{stageLine(run)}</span>
              </Link>
              <span className="lp-shelf-meta">
                <span className="lp-run-id">
                  {when(run.touched_at)} · {run.run_id}
                </span>
                <button
                  type="button"
                  className="lp-link-button"
                  disabled={moving !== null}
                  onClick={() => void move(run.run_id, !run.hidden)}
                >
                  {run.hidden ? 'Put back' : 'Hide'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {hidden.length > 0 && (
        <button
          type="button"
          className="lp-link-button lp-shelf-toggle"
          onClick={() => setShowHidden(value => !value)}
        >
          {showHidden ? 'Hide the hidden lists' : `Show ${hidden.length} hidden`}
        </button>
      )}
    </section>
  )
}
