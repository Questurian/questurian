import type { IntakeBrief } from '../intake.types'

/**
 * The brief, for approval.
 *
 * Read-only on purpose. Changing it means talking to the grill again, because
 * a typed brief is untracked instruction injected straight into the writing
 * assignment.
 *
 * Every field is shown, not the five that fit. This screen used to be a
 * summary, which was defensible while the brief was one input among a work
 * order and a dossier. It is now the whole assignment (ADR 0036): the reader,
 * the question and the tags all reach the writer verbatim, so approving
 * without seeing them is approving something unread.
 *
 * The material section shows the operator's own words back verbatim. First-hand
 * material skips fact-checking by design, so this screen is the only place a
 * wrong version of what they said can still be caught.
 */

interface BriefScreenProps {
  brief: IntakeBrief
  busy: boolean
  onGeneratePrompt: () => void
  onReopen: () => void
}

export function BriefScreen({ brief, busy, onGeneratePrompt, onReopen }: BriefScreenProps) {
  return (
    <section className="p2b-intake" aria-label="The brief">
      <p className="p2b-eyebrow">The brief</p>

      <dl className="p2b-brief">
        <dt>Who it&rsquo;s for</dt>
        <dd>{brief.primary_reader}</dd>

        <dt>What they&rsquo;re asking</dt>
        <dd>{brief.reader_question}</dd>

        <dt>What it should make them do</dt>
        <dd>{brief.outcome}</dd>

        <dt>What it&rsquo;s built on</dt>
        <dd>{brief.spine}</dd>

        <dt>Where</dt>
        <dd>{brief.location}</dd>

        <dt>Shape</dt>
        <dd>{brief.form_id}</dd>

        {brief.reader_tags.length > 0 && (
          <>
            <dt>Reader notes</dt>
            <dd>{brief.reader_tags.join(', ')}</dd>
          </>
        )}

        {brief.topic_module_ids.length > 0 && (
          <>
            <dt>Also covers</dt>
            <dd>{brief.topic_module_ids.join(', ')}</dd>
          </>
        )}

        {brief.must_name.length > 0 && (
          <>
            <dt>Has to name</dt>
            {/* One per line rather than comma-joined. These become the bullets
                the writer is held to, and a run-on sentence of them hides the
                one that is wrong. */}
            <dd>
              <ul className="p2b-must-name">
                {brief.must_name.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
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
                {item.note ? <span className="p2b-muted"> {item.note}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="p2b-note">
        The seed you typed opens the run and is kept for the record. The writer starts
        from it and writes a headline that describes what it actually wrote:{' '}
        <span className="p2b-muted">{brief.seed}</span>
      </p>

      <div className="p2b-intake-actions">
        <button type="button" onClick={onGeneratePrompt} disabled={busy}>
          Generate prompt
        </button>
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Change something
        </button>
      </div>
      <p className="p2b-muted">
        Generating the prompt costs nothing and writes nothing. You read it before
        anything is spent.
      </p>
    </section>
  )
}
