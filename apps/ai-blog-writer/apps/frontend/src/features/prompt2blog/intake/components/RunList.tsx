import { useEffect, useState } from 'react'
import * as api from '../intake.api'
import type { IntakeRunSummary } from '../intake.types'

/**
 * The runs you can go back to.
 *
 * The page tracked exactly one run, in `localStorage`. Lose that pointer or
 * start a second article and every earlier run became unreachable from the
 * interface, even though every stage of it was still on the server. On
 * 2026-08-31 the only way back to a live run was a `?run=<uuid>` URL produced
 * by querying the database by hand.
 *
 * Every long step in the pipeline invites the operator to leave the page.
 * Without a list, leaving is only safe if one browser's memory survives, which
 * is not a guarantee worth resting the work on.
 *
 * A run that never reached an article is listed like any other. A run is
 * created when the seed is typed (ADR 0031), so stopping in the grill is an
 * ordinary outcome and not something to hide.
 */

interface RunListProps {
  /** Open one. The page decides what that means. */
  onResume: (runId: string) => Promise<void>
}

/** Running first, because that is the one somebody is waiting on. */
function isLive(run: IntakeRunSummary): boolean {
  return run.status === 'running'
}

function when(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function RunList({ onResume }: RunListProps) {
  const [runs, setRuns] = useState<IntakeRunSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void api
      .listRuns()
      .then(found => {
        if (live) setRuns(found)
      })
      .catch(() => {
        // The list is a convenience. Failing to load it must not stand between
        // the operator and starting a new article.
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  if (failed || (runs !== null && runs.length === 0)) return null
  if (runs === null) return null

  const ordered = [...runs].sort(
    (left, right) => Number(isLive(right)) - Number(isLive(left)),
  )

  return (
    <section className="p2b-run-list">
      <h2 className="p2b-run-list-heading">Pick up where you left off</h2>
      <ul>
        {ordered.map(run => (
          <li key={run.run_id} className={isLive(run) ? 'p2b-run-live' : undefined}>
            <button
              type="button"
              className="p2b-run-open"
              disabled={opening !== null}
              onClick={() => {
                setOpening(run.run_id)
                void onResume(run.run_id).finally(() => setOpening(null))
              }}
            >
              <span className="p2b-run-seed">
                {/* A run that failed in the very first turn has no seed
                    recorded yet. Its id is all there is to call it. */}
                {run.seed || run.run_id}
              </span>
              <span className="p2b-run-meta">
                {isLive(run) && <span className="p2b-run-dot" aria-hidden="true" />}
                <span>{run.stage_label}</span>
                {when(run.updated_at) && <span>{when(run.updated_at)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
