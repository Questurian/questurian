import { useEffect, useMemo, useState } from 'react'
import { confirmProvenance, readProvenance } from '../intake.api'
import type { PassageProvenance, ProvenanceReport } from '../intake.types'

/**
 * Where the sentence in front of you came from.
 *
 * The article carries no attribution and is not going to: house rules forbid
 * in-article citation, and a reader does not want claim ids. But an editor
 * looking at a price has one question -- where did that come from, and when
 * was it true -- and answering it meant opening the dossier and matching
 * things up by eye.
 *
 * So the map is internal. Click a paragraph, see the chosen facts it shares a
 * figure or a distinctive phrase with, their dates, and the limits on stating
 * them.
 *
 * What this panel must never do is look like a check. A link is evidence about
 * provenance and not about meaning: two pieces of text share "$8", which is a
 * good reason to look and no reason at all to believe the sentence says what
 * the fact says. Every automatic link is labelled provisional and stays that
 * way until a person reads the pair and says otherwise, and the panel says so
 * in its own words rather than relying on a badge colour to carry it.
 */

interface ProvenancePanelProps {
  runId: string
  /** The paragraph the operator clicked, as it appears in the article. */
  selected: string | null
  onClose: () => void
}

/** A run started before provenance was recorded has none. Not an error. */
const NO_PACKET = 409

function useProvenance(runId: string) {
  const [report, setReport] = useState<ProvenanceReport | null>(null)
  const [unavailable, setUnavailable] = useState('')

  useEffect(() => {
    let live = true
    readProvenance(runId)
      .then(payload => {
        if (live) setReport(payload)
      })
      .catch((error: Error & { status?: number }) => {
        if (!live) return
        setUnavailable(
          error.status === NO_PACKET
            ? 'This run finished before the writer’s material was kept, so where each passage came from cannot be shown for it.'
            : error.message,
        )
      })
    return () => {
      live = false
    }
  }, [runId])

  return { report, unavailable }
}

function Link({
  runId,
  link,
  onConfirmed,
}: {
  runId: string
  link: PassageProvenance['links'][number]
  onConfirmed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const confirmed = link.status === 'confirmed'

  return (
    <li className="p2b-provenance-link">
      <p className="p2b-provenance-text">{link.text}</p>
      <p className="p2b-provenance-meta">
        {link.source_kind === 'material' ? 'Your own note' : 'Researched fact'}
        {link.as_of && ` · as of ${link.as_of}`}
        {link.confidence && ` · ${link.confidence} confidence`}
        {' · matched on '}
        {link.basis === 'figure' ? 'the figure ' : 'the wording '}
        <span className="p2b-provenance-shared">{link.shared.join(', ')}</span>
      </p>

      {link.caveats.map(caveat => (
        <p key={caveat} className="p2b-provenance-caveat">
          {caveat}
        </p>
      ))}

      {link.operator_note && (
        <p className="p2b-provenance-caveat">You noted: {link.operator_note}</p>
      )}

      {confirmed ? (
        <p className="p2b-provenance-status">You read these together and agreed.</p>
      ) : (
        <button
          type="button"
          className="p2b-secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            confirmProvenance(runId, {
              passage_hash: link.passage_hash,
              source_kind: link.source_kind,
              source_id: link.source_id,
            })
              .then(onConfirmed)
              .finally(() => setBusy(false))
          }}
        >
          These say the same thing
        </button>
      )}
    </li>
  )
}

export function ProvenancePanel({ runId, selected, onClose }: ProvenancePanelProps) {
  const { report, unavailable } = useProvenance(runId)
  const [confirmations, setConfirmations] = useState(0)

  // Matched on the paragraph's own text rather than on an index. The article
  // is rendered from the markdown and the map skips blocks that carry no
  // claim, so the two lists are not the same length and never were.
  const byText = useMemo(() => {
    const index = new Map<string, PassageProvenance>()
    for (const passage of report?.passages ?? []) {
      index.set(passage.text.replace(/\s+/g, ' ').trim(), passage)
    }
    return index
  }, [report, confirmations])

  if (unavailable) {
    return <p className="p2b-note">{unavailable}</p>
  }
  if (!report || !selected) return null

  const passage = byText.get(selected.replace(/\s+/g, ' ').trim())
  if (!passage) {
    return (
      <aside className="p2b-provenance" aria-label="Where this passage came from">
        <p className="p2b-note">
          Nothing on the desk matches this passage. It may be judgement,
          transition, or general background, all of which are allowed to have no
          fact behind them.
        </p>
        <button type="button" className="p2b-secondary" onClick={onClose}>
          Close
        </button>
      </aside>
    )
  }

  return (
    <aside className="p2b-provenance" aria-label="Where this passage came from">
      <p className="p2b-eyebrow">Where this came from</p>

      {passage.links.length === 0 ? (
        <p className="p2b-note">
          No chosen fact shares a figure or distinctive wording with this
          passage.
        </p>
      ) : (
        <ul className="p2b-provenance-links">
          {passage.links.map(link => (
            <Link
              key={`${link.source_kind}:${link.source_id}`}
              runId={runId}
              link={link}
              onConfirmed={() => setConfirmations(count => count + 1)}
            />
          ))}
        </ul>
      )}

      {passage.unmatched_figures.length > 0 && (
        <p className="p2b-provenance-unmatched">
          These figures match nothing on the desk:{' '}
          {passage.unmatched_figures.join(', ')}. Either the fact is stated
          differently from its record, or it came from somewhere else.
        </p>
      )}

      {/* An edit to a confirmed passage throws the confirmation away, which is
          right -- a confirmation beside changed prose is the one thing on this
          screen that says a person checked. Saying nothing about it is not
          right: somebody did that work and needs to know it has to be done
          again. */}
      {Number(report.summary.invalidated_confirmations ?? 0) > 0 && (
        <p className="p2b-provenance-invalidated" role="status">
          {String(report.summary.invalidated_confirmations)} confirmation
          {Number(report.summary.invalidated_confirmations) === 1 ? '' : 's'} no
          longer applies: the passage was edited after somebody checked it.
          Undoing the edit brings it back; otherwise the passage needs checking
          again.
        </p>
      )}

      {/* Said on the screen, not only in the payload. A list of facts beside a
          sentence reads as a check unless something says it is not one. */}
      <p className="p2b-provenance-means">{report.summary.means}</p>

      <button type="button" className="p2b-secondary" onClick={onClose}>
        Close
      </button>
    </aside>
  )
}
