import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import { buildStageArticleUrl } from '../../../blogArticles'
import { FindingList, ReviewedArticle } from './ReviewedArticle'
import type {
  IntakeDraft,
  IntakeGeneration,
  IntakeReview,
  IntakeReviewResult,
} from '../intake.types'

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
  /** Where the detector stands. Null until somebody asks for a read. */
  reviewState: IntakeReview | null
  /** What the last read found. */
  review: IntakeReviewResult | null
  busy: boolean
  onRetry: () => void
  onReopen: () => void
  onReview: () => void
  onSettleFinding: (
    findingId: string,
    verdict: 'agreed' | 'not_a_fault' | null,
  ) => void
}

function Receipt({ generation }: { generation: IntakeGeneration }) {
  // An article this app did not write has no receipt, because this app measured
  // nothing about it. Reporting a model, a duration or a cost here would be the
  // same lie as the v4 receipts that named Opus while Flash did the writing.
  if (generation.source === 'pasted') {
    return (
      <dl className="p2b-brief p2b-receipt">
        <dt>Where this came from</dt>
        <dd>
          Written outside this app and pasted in
          {generation.written_by ? `, ${generation.written_by}` : ''}
          {/* Their word. Nothing here resolved a model, so nothing here
              claims one. */}
          <span className="p2b-muted"> (as told to us, not checked)</span>
        </dd>
        <dt>Cost</dt>
        <dd>Nothing was spent here</dd>
      </dl>
    )
  }

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

/**
 * What the detector is doing, or what it found.
 *
 * A read costs money and takes minutes, so this says which of those is true
 * rather than leaving the page silent. It never says a draft is clean unless a
 * read actually came back with nothing: an absent review and a review with no
 * findings are different answers and must not look alike.
 */
function ReviewBar({
  reviewState,
  reviewing,
  busy,
  onReview,
}: {
  reviewState: IntakeReview | null
  reviewing: boolean
  busy: boolean
  onReview: () => void
}) {
  const cost = reviewState?.cost_usd
  return (
    <div className="p2b-review-bar">
      <button type="button" onClick={onReview} disabled={busy || reviewing}>
        {reviewing
          ? 'Reading it…'
          : reviewState?.has_review
            ? 'Read it again'
            : 'Read this draft'}
      </button>

      {reviewing && (
        <p className="p2b-muted">
          An editor is reading this against the brief and checking the facts it
          rests on. A few minutes. You can leave this page.
        </p>
      )}

      {!reviewing && !reviewState && (
        <p className="p2b-muted">
          Nobody has read this yet. Nothing here has been fact-checked.
        </p>
      )}

      {reviewState?.state === 'failed' && (
        <p className="p2b-fails-if">
          {reviewState.message ?? 'The draft could not be read.'}
        </p>
      )}

      {/* Kept separate from the count above: a read of an article that has
          since been rewritten is not wrong, it is simply not about this one. */}
      {reviewState?.stale && (
        <p className="p2b-fails-if">
          The findings below are from a read of an earlier draft. This article
          has been rewritten since, so read them as history.
        </p>
      )}

      {!reviewing && reviewState?.has_review && !reviewState.stale && (
        <p className="p2b-muted">
          {reviewState.finding_count === 0
            ? 'The editor read this and found nothing wrong with it.'
            : `${reviewState.finding_count} finding${reviewState.finding_count === 1 ? '' : 's'}, marked below.`}
          {typeof cost === 'number' ? ` That read cost $${cost.toFixed(2)}.` : ''}
        </p>
      )}
    </div>
  )
}

export function DraftScreen({
  runId,
  generation,
  draft,
  reviewState,
  review,
  busy,
  onRetry,
  onReopen,
  onReview,
  onSettleFinding,
}: DraftScreenProps) {
  const failed = generation.state === 'failed'
  const reviewing = reviewState?.state === 'running'
  // Marked up only when the read is about the article actually on screen. A
  // stale review's quotes point at paragraphs that no longer exist, so its
  // findings are listed rather than pinned to whatever they happen to match.
  const marked = review && reviewState?.has_review && !reviewState.stale

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

          <ReviewBar
            reviewState={reviewState}
            reviewing={reviewing}
            busy={busy}
            onReview={onReview}
          />

          {marked ? (
            <ReviewedArticle
              article={draft.article_markdown}
              review={review}
              onSettle={onSettleFinding}
            />
          ) : (
            <article className="p2b-draft-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {draft.article_markdown}
              </ReactMarkdown>
            </article>
          )}

          {/* Kept readable rather than hidden. A read of a draft that has
              since been rewritten is still a read somebody paid for. */}
          {review && reviewState?.stale && review.findings.length > 0 && (
            <div className="p2b-material">
              <p className="p2b-label">Findings from the earlier draft</p>
              <FindingList findings={review.findings} onSettle={onSettleFinding} />
            </div>
          )}

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
