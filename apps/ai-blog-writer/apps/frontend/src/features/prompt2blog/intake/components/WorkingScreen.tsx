import { useEffect, useState } from 'react'
import type { IntakeResearchProgress, IntakeWriting } from '../intake.types'

/**
 * What is happening, while it happens.
 *
 * Research is a fan of concurrent web searches and writing is a whole article,
 * and both used to leave the page completely silent for as long as they took.
 * A run that looked hung at seven minutes was working; a write that looked
 * dead had already finished. Both facts were on the run the whole time.
 *
 * The searches now go out together, so the count is what has come *back*. It
 * deliberately does not claim to name what is being searched right now:
 * several are, and picking one to show would be a comforting fiction.
 *
 * The elapsed clock is here because "is this working" is answered by movement,
 * not by a number. The expected duration is here because five minutes of
 * nothing is only alarming if you did not know it takes five minutes.
 */

interface WorkingScreenProps {
  /** Set while the research pass is running. */
  research?: IntakeResearchProgress | null
  /** Set while the graph is writing. */
  writing?: IntakeWriting | null
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const minutes = Math.floor(seconds / 60)
  return (
    <span className="p2b-elapsed">
      {minutes}:{String(seconds % 60).padStart(2, '0')} elapsed
    </span>
  )
}

export function WorkingScreen({ research, writing }: WorkingScreenProps) {
  const gathering = research?.phase === 'gathering'
  const heading = writing
    ? writing.stage_label
    : gathering
      ? research!.done === 0
        ? `Searching the web: ${research!.total} questions at once`
        : `Searching the web: ${research!.done} of ${research!.total} back`
      : 'Turning the research into records'

  const detail = writing
    ? 'The whole article, then a check of every claim against the research. This usually takes five to ten minutes.'
    : gathering
      ? research!.done === 0
        ? 'They all go out together, so the wait is the slowest single search.'
        : `Last back: ${research!.last_question_back}`
      : 'One long call. This is the slowest single step in the run.'

  const done = research && !writing ? research.done : 0
  const total = research && !writing ? research.total : 0

  return (
    <section className="p2b-working" aria-live="polite" aria-busy="true">
      <div className="p2b-working-head">
        <span className="p2b-spinner" aria-hidden="true" />
        <p className="p2b-working-heading">{heading}</p>
      </div>

      {detail && <p className="p2b-working-detail">{detail}</p>}

      {total > 0 && (
        <div
          className="p2b-progress"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      )}

      <p className="p2b-working-foot">
        <Elapsed />
        {/* Said plainly, because the tab was closed once on the belief that
            closing it would lose the work. It does not: the run is on the
            server and the page picks it back up. */}
        <span className="p2b-muted">You can leave this page. The work carries on.</span>
      </p>
    </section>
  )
}
