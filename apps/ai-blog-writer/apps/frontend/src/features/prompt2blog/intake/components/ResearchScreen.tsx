import type { IntakeResearch } from '../intake.types'
import { VenueCheck } from './VenueCheck'

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
  runId: string
  /** The questions themselves, which live on the work order, not the dossier. */
  questions?: Record<string, { question: string; kind: string }>
  research: IntakeResearch
  busy: boolean
  onWrite: () => void
  onReopen: () => void
  onChanged: () => void
}

const STATUS_WORDS: Record<string, string> = {
  supported: 'answered',
  partial: 'partly answered',
  missing: 'not answered',
  unpublished: 'nobody publishes this',
}

export function ResearchScreen({
  runId,
  questions,
  research,
  busy,
  onWrite,
  onReopen,
  onChanged,
}: ResearchScreenProps) {
  const coverage = research.coverage
  const canWrite = coverage.can_write

  return (
    <section className="p2b-intake" aria-label="What research found">
      <p className="p2b-eyebrow">What we found</p>

      <p className="p2b-research-summary">
        {research.source_count} sources, {research.claim_count} facts.
      </p>

      {/* The questions and what came back for each. This was a list of ids
          and statuses -- "q3, partly answered" -- which says neither what was
          asked nor what was found, and leaves the operator's own decision
          unmakeable. */}
      <ol className="p2b-findings">
        {Object.entries(research.requirement_status).map(([id, status]) => {
          const finding = research.findings?.[id]
          const asked = questions?.[id]
          return (
            <li key={id} className="p2b-finding">
              <div className="p2b-finding-head">
                <span className={`p2b-kind${asked?.kind === 'load_bearing' ? ' p2b-kind-core' : ''}`}>
                  {asked?.kind === 'texture' ? 'texture' : 'load-bearing'}
                </span>
                <span className="p2b-finding-status">{STATUS_WORDS[status] ?? status}</span>
              </div>

              <p className="p2b-finding-ask">{asked?.question ?? id}</p>

              {finding?.claims?.length ? (
                <ul className="p2b-finding-claims">
                  {finding.claims.map(claim => (
                    <li key={claim.claim_id}>
                      {claim.text}
                      {claim.sources.length > 0 && (
                        <span className="p2b-finding-source">
                          {claim.sources
                            .map(source => source.title)
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      )}
                      {claim.venue_note && (
                        <span className="p2b-finding-note">You noted: {claim.venue_note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p2b-finding-empty">Nothing found.</p>
              )}

              {finding?.gap && <p className="p2b-finding-gap">{finding.gap}</p>}
            </li>
          )
        })}
      </ol>

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

      {/* Liveness, not a gate. Skippable in one click. */}
      {canWrite && <VenueCheck runId={runId} onChanged={onChanged} />}

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
