import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { anchorFindings, worstSeverity } from './findings'
import type { IntakeFinding, IntakeReviewResult } from '../intake.types'

/**
 * The article, with what an editor found wrong marked on it.
 *
 * Detection only. Nothing here proposes replacement text and there is no apply
 * button, because nobody yet knows what is actually wrong with these articles.
 * Fixing before the faults are known is how the old pipeline ended up with 41
 * prohibitions and no description of what a good piece is.
 *
 * A finding is marked on the paragraph rather than on an exact span. The
 * editor copies its quote by hand out of an article that has bold and links in
 * it, so a character-exact highlight lands wrong often enough to matter -- and
 * a highlight one word off reads as the machine misquoting the article. What
 * cannot be tied to a paragraph is listed under it rather than dropped: a
 * finding nobody can see is worse than one at the bottom of the page.
 *
 * The two verdict buttons are the operator's, kept beside the model's finding
 * and never over it. Nothing in the app acts on them; they exist so the read
 * across runs can skip what has already been thrown out.
 */

interface ReviewedArticleProps {
  article: string
  review: IntakeReviewResult
  onSettle: (findingId: string, verdict: 'agreed' | 'not_a_fault' | null) => void
}

const SEVERITY_WORDS: Record<IntakeFinding['severity'], string> = {
  serious: 'Serious',
  notable: 'Notable',
  minor: 'Minor',
}

function FindingCard({
  finding,
  onSettle,
}: {
  finding: IntakeFinding
  onSettle: ReviewedArticleProps['onSettle']
}) {
  const settled = finding.verdict
  return (
    <div className={`p2b-finding p2b-finding--${finding.severity}`}>
      <p className="p2b-finding-head">
        <span
          className={`p2b-finding-severity p2b-finding-severity--${finding.severity}`}
        >
          {SEVERITY_WORDS[finding.severity]}
        </span>
        {/* The model's own words. Not a value from a list in the code: a fixed
            vocabulary would decide in advance what kinds of fault exist, which
            is the thing this phase is investigating. */}
        <span className="p2b-finding-label">{finding.label}</span>
      </p>

      {!finding.whole_article && (
        <blockquote className="p2b-finding-quote">{finding.quote}</blockquote>
      )}

      <p className="p2b-finding-problem">{finding.problem}</p>

      <div className="p2b-finding-verdict">
        <button
          type="button"
          className={settled === 'agreed' ? 'p2b-verdict-on' : 'p2b-secondary'}
          aria-pressed={settled === 'agreed'}
          onClick={() =>
            onSettle(finding.finding_id, settled === 'agreed' ? null : 'agreed')
          }
        >
          Real problem
        </button>
        <button
          type="button"
          className={settled === 'not_a_fault' ? 'p2b-verdict-on' : 'p2b-secondary'}
          aria-pressed={settled === 'not_a_fault'}
          onClick={() =>
            onSettle(
              finding.finding_id,
              settled === 'not_a_fault' ? null : 'not_a_fault',
            )
          }
        >
          Not a fault
        </button>
      </div>
    </div>
  )
}

/**
 * The findings as a plain list, with nothing marked on anything.
 *
 * For a read of a draft that has since been rewritten. Its quotes point at
 * paragraphs that no longer exist, so anchoring them would put marks on
 * whatever happened to match -- but the findings themselves are still the
 * honest record of a read somebody paid for, and the verdicts on them still
 * count towards the read across runs.
 */
export function FindingList({
  findings,
  onSettle,
}: {
  findings: IntakeFinding[]
  onSettle: ReviewedArticleProps['onSettle']
}) {
  return (
    <>
      {findings.map((finding) => (
        <FindingCard key={finding.finding_id} finding={finding} onSettle={onSettle} />
      ))}
    </>
  )
}

export function ReviewedArticle({ article, review, onSettle }: ReviewedArticleProps) {
  const [open, setOpen] = useState<string | null>(null)
  const { blocks, unanchored } = anchorFindings(article, review.findings)

  return (
    <>
      <article className="p2b-draft-body p2b-draft-body--reviewed">
        {blocks.map((block, index) => {
          const severity = worstSeverity(block.findings)
          if (!severity) {
            return (
              <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
                {block.markdown}
              </ReactMarkdown>
            )
          }
          const showing = block.findings.some((item) => item.finding_id === open)
          return (
            <div key={index} className={`p2b-marked p2b-marked--${severity}`}>
              <button
                type="button"
                className="p2b-marked-toggle"
                aria-expanded={showing}
                onClick={() => setOpen(showing ? null : block.findings[0].finding_id)}
              >
                {block.findings.length === 1
                  ? `1 finding — ${block.findings[0].label}`
                  : `${block.findings.length} findings`}
              </button>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {block.markdown}
              </ReactMarkdown>
              {showing && (
                <div className="p2b-marked-findings">
                  {block.findings.map((finding) => (
                    <FindingCard
                      key={finding.finding_id}
                      finding={finding}
                      onSettle={onSettle}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </article>

      {unanchored.length > 0 && (
        <div className="p2b-material">
          <p className="p2b-label">About the whole piece</p>
          <p className="p2b-muted">
            These are not about one paragraph, or their quote could not be found
            in the article.
          </p>
          {unanchored.map((finding) => (
            <FindingCard
              key={finding.finding_id}
              finding={finding}
              onSettle={onSettle}
            />
          ))}
        </div>
      )}

      {/* The editor's overall read. Last, because a paragraph-by-paragraph list
          of faults is not the same as a judgement of the piece. */}
      {review.verdict && (
        <div className="p2b-material">
          <p className="p2b-label">The editor&rsquo;s overall read</p>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{review.verdict}</ReactMarkdown>
        </div>
      )}

      {review.parse_issue && (
        <p className="p2b-note p2b-fails-if">{review.parse_issue}</p>
      )}
    </>
  )
}
