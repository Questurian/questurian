import { useState } from 'react'
import { Link } from 'react-router-dom'
import payloadLogoUrl from '../../../../assets/payload-logo.svg?url'
import { buildStageArticleUrl } from '../../../blogArticles'
import type { IntakeArticle, IntakeWriting } from '../intake.types'
import { PolishPrompt } from './PolishPrompt'
import { ProvenancePanel } from './ProvenancePanel'
import { SectionEditor } from './SectionEditor'
import { PunchList } from './PunchList'

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
 *
 * That one click did not exist. v2 and v3 both ended on a result screen
 * carrying "Stage in Payload Editor"; this screen replaced them and did not
 * carry it across, so a finished article could be read and not kept -- the
 * editor was reachable only from Saved Articles, which is not where anyone is
 * standing when the run ends.
 *
 * Same route, same params and same label as the screens it replaced, because
 * staging is one step in this app and renaming it here would make it look like
 * two. The stamp is still not obeyed: a `needs_revision` article carries the
 * same button as a clean one.
 */

interface ArticleScreenProps {
  runId: string
  writing: IntakeWriting
  article: IntakeArticle | null
  onReopen: () => void
  busy: boolean
}

function Measured({
  checks,
  stale = false,
}: {
  checks: Record<string, unknown>
  // True once the article has been hand-edited. These numbers were measured on
  // the pipeline's draft and nothing has re-measured them, so they are dimmed
  // and labelled rather than removed: they are still the last real reading of
  // this article, and hiding them would lose that.
  stale?: boolean
}) {
  const count = Number(checks.sentence_count ?? 0)
  if (!count) return null
  const share = Number(checks.sentence_widest_band_share ?? 0)
  const note = String(checks.sentence_variety_note ?? '')
  return (
    <div className={stale ? 'p2b-measured p2b-measured--stale' : 'p2b-measured'}>
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


/**
 * The article's blocks, each carrying the id of the section it belongs to.
 *
 * The backend addresses sections positionally — the block before the first
 * `##` is `s0` — so the only way this screen and an edit request can agree
 * about which section is which is for both to count `##` headings in document
 * order. Doing it here, once, keeps that counting out of the render.
 */
function addressedBlocks(markdown: string) {
  let sectionIndex = 0
  return markdown.split(/\n{2,}/).map((block, index) => {
    const heading = block.startsWith('#')
    if (heading) sectionIndex += 1
    return {
      key: index,
      heading,
      text: heading ? block.replace(/^#+\s*/, '') : block,
      sectionId: `s${sectionIndex}`,
    }
  })
}

export function ArticleScreen({ runId, writing, article, onReopen, busy }: ArticleScreenProps) {
  // Which paragraph the operator asked about. Null until they ask: the map is
  // a finding aid and nothing about the article changes because it exists.
  const [asking, setAsking] = useState<string | null>(null)
  // The article after hand edits. Null while it is still exactly what the
  // pipeline produced, so nothing about this screen changes on a run nobody
  // edited.
  const [edited, setEdited] = useState<string | null>(null)
  // Which section is open for editing, by the same positional id the backend
  // addresses sections with: the block before the first `##` is s0.
  const [editing, setEditing] = useState<{ id: string; heading: string } | null>(
    null,
  )

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
  // Everything above the article -- the readiness verdict, the measured
  // checks, the word count -- describes the draft the pipeline wrote. A hand
  // edit changes the article and cannot change that assessment: nothing
  // re-runs the audit, and nothing should, because an audit is a pre-writing
  // gate and this is after.
  //
  // So the moment the text below stops being the text that was assessed, the
  // assessment says whose it is. Showing "Ready for staging · 1,420 words"
  // over prose somebody has since cut by two hundred words is the screen
  // asserting something nobody checked.
  const handEdited = edited !== null
  // Recomputed rather than carried over. It is the one figure here that is
  // deterministic and free, so a stale one is a choice.
  const liveWordCount = handEdited
    ? edited.replace(/[#*_>`]/g, ' ').split(/\s+/).filter(Boolean).length
    : writing.word_count

  return (
    <section className="p2b-intake p2b-article" aria-label="The finished article">
      <p className="p2b-eyebrow">
        {handEdited ? 'Edited by hand' : ready ? 'Ready for staging' : 'Written, with notes'}
        {liveWordCount ? ` · ${liveWordCount} words` : ''}
      </p>

      <h2 className="p2b-article-title">{writing.final_title || article?.title}</h2>

      {handEdited && (
        <p className="p2b-stale-assessment" role="status">
          The checks below describe the draft the pipeline wrote, not the text
          on this page. Nothing has re-read the article since you edited it.
        </p>
      )}

      {writing.readiness_blockers.length > 0 && (
        <ul className="p2b-blockers">
          {writing.readiness_blockers.map(blocker => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}

      <Measured checks={writing.constraint_checks} stale={handEdited} />

      {writing.outline_warning && <p role="status">{writing.outline_warning}</p>}

      {article ? (
        <article className="p2b-article-body">
          {addressedBlocks(edited ?? article.markdown).map(block =>
            block.heading ? (
              <h3 key={block.key}>
                {block.text}
                <button
                  type="button"
                  className="p2b-passage-source"
                  aria-label={`Edit ${block.text}`}
                  onClick={() =>
                    setEditing({ id: block.sectionId, heading: block.text })
                  }
                >
                  edit
                </button>
              </h3>
            ) : (
              // A button rather than a click handler on the paragraph: this is
              // an action, and an editor reading with a keyboard has the same
              // right to ask where a price came from as one with a mouse.
              <p
                key={block.key}
                className={
                  asking === block.text
                    ? 'p2b-passage p2b-passage-asking'
                    : 'p2b-passage'
                }
              >
                {block.text}
                <button
                  type="button"
                  className="p2b-passage-source"
                  aria-label="Where did this passage come from?"
                  onClick={() =>
                    setAsking(current => (current === block.text ? null : block.text))
                  }
                >
                  source
                </button>
              </p>
            ),
          )}
        </article>
      ) : (
        <p className="p2b-note">Loading the article…</p>
      )}

      {asking && (
        <ProvenancePanel runId={runId} selected={asking} onClose={() => setAsking(null)} />
      )}

      {editing && (
        <SectionEditor
          runId={runId}
          sectionId={editing.id}
          heading={editing.heading}
          onApplied={markdown => {
            setEdited(markdown)
            // The map described the prose that was there a moment ago.
            setAsking(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <PunchList runId={runId} />

      <PolishPrompt runId={runId} />

      <div className="p2b-intake-actions">
        <Link
          className="payload-action-btn"
          to={buildStageArticleUrl('prompt2blog', {
            run_id: runId,
            title: writing.final_title || article?.title || '',
            article_type: article?.form_label || '',
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
        <button type="button" className="p2b-secondary" onClick={onReopen} disabled={busy}>
          Start again from the grill
        </button>
      </div>
    </section>
  )
}
