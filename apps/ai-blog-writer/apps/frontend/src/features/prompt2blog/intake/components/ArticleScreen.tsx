import type { IntakeArticle, IntakeWriting } from '../intake.types'
import { PolishPrompt } from './PolishPrompt'

/**
 * The finished article.
 *
 * There was no view of a completed run at all. The graph finished, the article
 * sat in the database, and the page went on showing the research screen — so
 * the first article this pipeline ever wrote was invisible for twenty minutes.
 *
 * The stamp is shown and never obeyed. Once prose exists nothing blocks
 * (ADR 0030): a run stamped `needs_revision` for being forty one words long is
 * savable in one click, and failures are worth keeping because that is how the
 * next failure gets diagnosed.
 */

interface ArticleScreenProps {
  runId: string
  writing: IntakeWriting
  article: IntakeArticle | null
  onReopen: () => void
  busy: boolean
}

function Measured({ checks }: { checks: Record<string, unknown> }) {
  const count = Number(checks.sentence_count ?? 0)
  if (!count) return null
  const share = Number(checks.sentence_widest_band_share ?? 0)
  const note = String(checks.sentence_variety_note ?? '')
  return (
    <div className="p2b-measured">
      <dl>
        <div>
          <dt>Sentences</dt>
          <dd>{count}</dd>
        </div>
        <div>
          <dt>Average length</dt>
          <dd>{String(checks.sentence_mean_words ?? '—')} words</dd>
        </div>
        <div>
          <dt>Within five words</dt>
          <dd>{Math.round(share * 100)}%</dd>
        </div>
        <div>
          <dt>Over 25 words</dt>
          <dd>{String(checks.sentences_over_25_words ?? '—')}</dd>
        </div>
      </dl>
      {/* Said once, and never enforced. */}
      {note && <p className="p2b-measured-note">{note}</p>}
    </div>
  )
}

export function ArticleScreen({ runId, writing, article, onReopen, busy }: ArticleScreenProps) {
  if (writing.state === 'failed') {
    return (
      <section className="p2b-intake" aria-label="The writing failed">
        <p className="p2b-eyebrow">The writing stopped</p>
        <p className="p2b-question">{writing.error || 'The writer did not finish.'}</p>
        <p className="p2b-note">
          It stopped at {writing.stage_label.toLowerCase()}. The research is still on this
          run, so going back to the grill keeps everything up to that point.
        </p>
        <div className="p2b-intake-actions">
          <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
            Back to the grill
          </button>
        </div>
      </section>
    )
  }

  const ready = writing.pipeline_status === 'ready_for_staging'

  return (
    <section className="p2b-intake p2b-article" aria-label="The finished article">
      <p className="p2b-eyebrow">
        {ready ? 'Ready for staging' : 'Written, with notes'}
        {writing.word_count ? ` · ${writing.word_count} words` : ''}
      </p>

      <h2 className="p2b-article-title">{writing.final_title || article?.title}</h2>

      {writing.readiness_blockers.length > 0 && (
        <ul className="p2b-blockers">
          {writing.readiness_blockers.map(blocker => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}

      <Measured checks={writing.constraint_checks} />

      {article ? (
        <article className="p2b-article-body">
          {article.markdown.split(/\n{2,}/).map((block, index) =>
            block.startsWith('#') ? (
              <h3 key={index}>{block.replace(/^#+\s*/, '')}</h3>
            ) : (
              <p key={index}>{block}</p>
            ),
          )}
        </article>
      ) : (
        <p className="p2b-note">Loading the article…</p>
      )}

      <PolishPrompt runId={runId} />

      <div className="p2b-intake-actions">
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Start again from the grill
        </button>
      </div>
    </section>
  )
}
