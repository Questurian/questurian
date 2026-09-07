import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import { buildStageArticleUrl } from '../../../blogArticles'
import type { IntakeDraft, IntakeGeneration } from '../intake.types'

/**
 * The article the writer produced.
 *
 * A draft, and named as one. There is no score, no readiness verdict and no
 * green stamp, because ADR 0036 removed the machinery that produced them and a
 * badge saying "verified" over an unchecked article is worse than no badge.
 *
 * The article is first and the research note is beside it, never inside it.
 * The note is a list of URLs and admissions, and published as body text it
 * reads as prose to anything that only counts words.
 *
 * Staging is one click from here. Both screens this replaced ended without it,
 * and a finished article that can be read and not kept sends the operator back
 * through Saved Articles to find what is already on screen.
 */

interface DraftScreenProps {
  runId: string
  generation: IntakeGeneration
  draft: IntakeDraft | null
  busy: boolean
  onRetry: () => void
  onReopen: () => void
}

function Receipt({ generation }: { generation: IntakeGeneration }) {
  const minutes = generation.elapsed_seconds
    ? Math.round(generation.elapsed_seconds / 60)
    : null
  // What was asked for beside what answered. Every v4 receipt said Opus while
  // Flash wrote the article, so a substitution has to be visible as a
  // difference between two names rather than an absence.
  const substituted =
    generation.served_model &&
    generation.requested_model &&
    !generation.served_model.includes(generation.requested_model.split('-')[1] ?? '')

  return (
    <dl className="p2b-brief p2b-receipt">
      <dt>Written by</dt>
      <dd>
        {generation.served_model ?? 'unknown'}
        {generation.effort ? `, ${generation.effort} effort` : ''}
        {substituted && (
          <span className="p2b-fails-if">
            {' '}
            (you asked for {generation.requested_model})
          </span>
        )}
      </dd>

      {minutes !== null && (
        <>
          <dt>Took</dt>
          <dd>{minutes < 1 ? 'under a minute' : `about ${minutes} minutes`}</dd>
        </>
      )}

      {generation.turns !== null && (
        <>
          <dt>Round trips</dt>
          {/* Said plainly: one writer is not one billable call. */}
          <dd>{generation.turns} exchanges with the model, including its searches</dd>
        </>
      )}

      {generation.cost_usd !== null && (
        <>
          <dt>Cost</dt>
          <dd>${generation.cost_usd.toFixed(2)} at API rates</dd>
        </>
      )}

      {generation.tool_denials.length > 0 && (
        <>
          <dt>Asked for and refused</dt>
          <dd>{generation.tool_denials.join(', ')}</dd>
        </>
      )}
    </dl>
  )
}

export function DraftScreen({
  runId,
  generation,
  draft,
  busy,
  onRetry,
  onReopen,
}: DraftScreenProps) {
  const failed = generation.state === 'failed'

  return (
    <section className="p2b-intake" aria-label="The draft">
      <p className="p2b-eyebrow">The draft</p>

      {failed && (
        <div className="p2b-error" role="alert">
          <p>{generation.message ?? 'The article could not be written.'}</p>
          {/* The words Claude sent back when they were not an article. They
              were paid for, so they are readable rather than discarded. */}
          {generation.raw && <pre className="p2b-prompt-text">{generation.raw}</pre>}
        </div>
      )}

      {generation.parse_issue && (
        <p className="p2b-note p2b-fails-if">{generation.parse_issue}</p>
      )}

      {draft ? (
        <>
          <h2 className="p2b-draft-headline">{draft.headline || 'Untitled'}</h2>
          <p className="p2b-muted">{draft.word_count} words</p>

          <article className="p2b-draft-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {draft.article_markdown}
            </ReactMarkdown>
          </article>

          {/* Beside the article, never inside it. */}
          <div className="p2b-material">
            <p className="p2b-label">Research note</p>
            {draft.research_note ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {draft.research_note}
              </ReactMarkdown>
            ) : (
              <p className="p2b-muted">
                No sources were listed. Nothing here has been checked.
              </p>
            )}
          </div>

          <Receipt generation={generation} />

          <div className="p2b-intake-actions">
            <Link
              className="payload-action-btn"
              to={buildStageArticleUrl('prompt2blog', {
                run_id: runId,
                title: draft.headline || '',
                article_type: '',
              })}
            >
              <img
                src={payloadLogoUrl}
                alt=""
                aria-hidden="true"
                className="payload-action-btn-icon"
              />
              Stage in Payload Editor
            </Link>
            <button type="button" className="p2b-secondary" onClick={onRetry} disabled={busy}>
              Write it again
            </button>
            <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
              Change something
            </button>
          </div>
          <p className="p2b-muted">
            Writing it again costs another article and keeps this one. Nothing here
            has been fact-checked by the app.
          </p>
        </>
      ) : (
        <div className="p2b-intake-actions">
          <button type="button" onClick={onRetry} disabled={busy}>
            Try again
          </button>
          <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
            Change something
          </button>
        </div>
      )}
    </section>
  )
}
