import type { IntakeResearch } from '../intake.types'

/**
 * What research found, and whether it is enough.
 *
 * A run that cannot be written is not an error. The brief was valid, the plan
 * was valid, and no writing has been paid for — so this screen's job is to say
 * what is missing and point at the one door that opens.
 *
 * That door is always the grill. A question nobody answered can be re-asked; a
 * premise that turned out not to be so cannot, and saying "research again"
 * there would be a lie.
 */

interface ResearchScreenProps {
  research: IntakeResearch
  busy: boolean
  onWrite: () => void
  onReopen: () => void
}

const STATUS_WORDS: Record<string, string> = {
  supported: 'answered',
  partial: 'partly answered',
  missing: 'not answered',
  unpublished: 'nobody publishes this',
}

export function ResearchScreen({ research, busy, onWrite, onReopen }: ResearchScreenProps) {
  const coverage = research.coverage
  const canWrite = coverage.can_write

  return (
    <section className="p2b-intake" aria-label="What research found">
      <p className="p2b-eyebrow">What we found</p>

      <p className="p2b-research-summary">
        {research.source_count} sources, {research.claim_count} facts.
      </p>

      <ul className="p2b-questions">
        {Object.entries(research.requirement_status).map(([id, status]) => (
          <li key={id}>
            <span className="p2b-question-text">{id}</span>
            <span className="p2b-kind">{STATUS_WORDS[status] ?? status}</span>
          </li>
        ))}
      </ul>

      {research.conflicts.length > 0 && (
        <div className="p2b-material">
          <p className="p2b-label">Sources disagreed</p>
          <ul>
            {research.conflicts.map(conflict => (
              <li key={conflict}>{conflict}</li>
            ))}
          </ul>
        </div>
      )}

      {!canWrite && (
        <div className="p2b-blocked">
          <p className="p2b-label">Not enough to write from yet</p>
          <ul>
            {coverage.findings.map(finding => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
          {coverage.reason === 'premise_refuted' && (
            // More research cannot clear this one. Offering it would send the
            // operator round a loop that returns the same refutation.
            <p className="p2b-note">
              This is not something more research can fix. The article was
              commissioned about something that turns out not to be so.
            </p>
          )}
        </div>
      )}

      <div className="p2b-intake-actions">
        {canWrite ? (
          <button type="button" onClick={onWrite} disabled={busy}>
            Write it
          </button>
        ) : (
          <button type="button" onClick={onReopen} disabled={busy}>
            Back to the grill
          </button>
        )}
        {canWrite && (
          <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
            Change something first
          </button>
        )}
      </div>
    </section>
  )
}
