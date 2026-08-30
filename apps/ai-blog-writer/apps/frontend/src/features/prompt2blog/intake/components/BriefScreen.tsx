import type { IntakeBrief } from '../intake.types'

/**
 * The brief, for approval.
 *
 * Read-only on purpose. Changing it means talking to the grill again, because
 * a typed brief is untracked instruction injected into every stage after it.
 *
 * The material section shows the operator's own words back verbatim. First-hand
 * material skips fact-checking by design, so this screen is the only place a
 * wrong version of what they said can still be caught.
 */

interface BriefScreenProps {
  brief: IntakeBrief
  busy: boolean
  onPlanResearch: () => void
  onReopen: () => void
}

export function BriefScreen({ brief, busy, onPlanResearch, onReopen }: BriefScreenProps) {
  return (
    <section className="p2b-intake" aria-label="The brief">
      <p className="p2b-eyebrow">The brief</p>

      <dl className="p2b-brief">
        <dt>What it should make them do</dt>
        <dd>{brief.outcome}</dd>

        <dt>What it&rsquo;s built on</dt>
        <dd>{brief.spine}</dd>

        <dt>Where</dt>
        <dd>{brief.location}</dd>

        {brief.must_name.length > 0 && (
          <>
            <dt>Has to name</dt>
            <dd>{brief.must_name.join(', ')}</dd>
          </>
        )}

        <dt>It fails if</dt>
        <dd className="p2b-fails-if">{brief.fails_if}</dd>
      </dl>

      <div className="p2b-material">
        <p className="p2b-label">What you told us you have</p>
        {brief.material.length === 0 ? (
          <p className="p2b-muted">
            Nothing of your own &mdash; this one is written from research.
          </p>
        ) : (
          <ul>
            {brief.material.map(item => (
              <li key={item.statement}>
                <span className="p2b-material-kind">{item.kind}</span>
                {/* Verbatim. If this is not what you said, say so in the grill. */}
                <q>{item.statement}</q>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="p2b-note">
        The seed you typed is kept for reference, but it is not a promise the article
        has to keep: <span className="p2b-muted">{brief.seed}</span>
      </p>

      <div className="p2b-intake-actions">
        <button type="button" onClick={onPlanResearch} disabled={busy}>
          Plan the research
        </button>
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Change something
        </button>
      </div>
    </section>
  )
}
