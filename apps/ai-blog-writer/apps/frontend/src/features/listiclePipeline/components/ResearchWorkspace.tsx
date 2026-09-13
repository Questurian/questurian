import { useEffect, useRef, useState } from 'react'
import {
  applyResearchImport,
  loadProfileResearch,
  openResearchWorkspace,
  previewResearchImport,
  saveEntryBlurb,
  saveResearchWorkspace
} from '../api'
import type {
  EntryResearchField,
  EntryResearchSlots,
  EntryResearchWorkspace,
  ListicleProfileResearch,
  ResearchImportPreview
} from '../types'

const LABELS: Record<EntryResearchField, string> = {
  why_it_belongs: 'Why it belongs',
  what_to_order_or_notice: 'What to order or notice',
  visit_character: 'What the visit feels like',
  useful_detail: 'Useful detail',
  story_depth: 'People, history, or recognition',
  caveat: 'Caveat'
}
const fields = Object.keys(LABELS) as EntryResearchField[]
const printable = (value: string | string[] | null) =>
  Array.isArray(value) ? value.join('\n') : value || ''

export function ResearchWorkspace({
  runId,
  candidateId,
  onProfile,
  active
}: {
  runId: string
  candidateId: string
  onProfile: (profileId: string) => void
  active: boolean
}) {
  const previewPanel = useRef<HTMLElement>(null)
  const [saved, setSaved] = useState<EntryResearchWorkspace | null>(null)
  const [draft, setDraft] = useState<EntryResearchSlots | null>(null)
  const [research, setResearch] = useState<ListicleProfileResearch | null>(null)
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<ResearchImportPreview | null>(null)
  const [selected, setSelected] = useState<EntryResearchField[]>([])
  const [factIds, setFactIds] = useState<string[]>([])
  const [importKey, setImportKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [blurbText, setBlurbText] = useState('')
  useEffect(() => {
    previewPanel.current?.scrollIntoView?.({ block: 'start' })
  }, [preview])
  const dirty = !!saved && JSON.stringify(saved.slots) !== JSON.stringify(draft)

  useEffect(() => {
    let live = true
    void openResearchWorkspace(runId, candidateId)
      .then(async (view) => {
        if (!live) return
        setSaved(view)
        setDraft(view.slots)
        setBlurbText(view.blurb?.text ?? '')
        onProfile(view.profile_id)
      })
      .catch((error) => {
        if (live)
          setError(
            error instanceof Error ? error.message : 'Could not open research.'
          )
      })
    return () => {
      live = false
    }
  }, [runId, candidateId, onProfile])

  useEffect(() => {
    if (!active || !saved?.profile_id) return
    let live = true
    void loadProfileResearch(saved.profile_id)
      .then(profile => { if (live) setResearch(profile) })
      .catch(error => { if (live) setError(error instanceof Error ? error.message : 'Could not load sources.') })
    return () => { live = false }
  }, [active, saved?.profile_id])

  async function action(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save research.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function accept(view: EntryResearchWorkspace) {
    setSaved(view)
    setDraft(view.slots)
    setBlurbText(view.blurb?.text ?? '')
    setPreview(null)
    onProfile(view.profile_id)
    setResearch(await loadProfileResearch(view.profile_id))
  }
  const ready =
    !!draft?.why_it_belongs?.trim() &&
    draft.what_to_order_or_notice.some((value) => value.trim())
  const referenced = new Set(
    Object.values(saved?.supporting_findings ?? {}).flat()
  )
  const useful =
    research?.findings.filter(
      (f) => referenced.has(f.finding_id) || f.curation === 'kept'
    ) ?? []
  const unused = research?.findings.filter((f) => !useful.includes(f)) ?? []

  return (
    <section className="lp-workspace" aria-label="Research workspace">
      {error && (
        <p role="alert" className="lp-error lp-workspace-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="lp-workspace-message">
          {notice}
        </p>
      )}
      {!saved || !draft ? (
        <p>
          {error
            ? 'Close this panel and check the preparation card, then reopen.'
            : 'Opening saved workspace…'}
        </p>
      ) : (
        <>
          <aside className="lp-workspace-tools">
            <h4>Bring back useful research</h4>
            <p>
              A few concrete details for a short blurb. Use your preferred
              web-enabled model.
            </p>
            <button
              className="lp-tool"
              onClick={() => setShowPrompt(!showPrompt)}
            >
              View research prompt
            </button>
            {showPrompt && (
              <>
                <textarea
                  readOnly
                  aria-label="Research prompt"
                  value={saved.prompt}
                  rows={12}
                />
                <button
                  className="lp-tool"
                  onClick={() =>
                    void action(async () => {
                      await navigator.clipboard.writeText(saved.prompt)
                      setNotice('Prompt copied.')
                    })
                  }
                >
                  Copy prompt
                </button>
              </>
            )}
            <label>
              Paste research JSON
              <textarea
                aria-label="Paste research JSON"
                rows={9}
                value={raw}
                disabled={busy}
                onChange={(event) => {
                  setRaw(event.target.value)
                  setPreview(null)
                  setImportKey('')
                }}
              />
              <small>
                Use the code block&apos;s copy button. Links copied from the page
                are repaired, but the copy button is exact.
              </small>
            </label>
            <button
              className="lp-tool"
              disabled={busy || !raw.trim() || dirty}
              onClick={() =>
                void action(async () => {
                  const found = await previewResearchImport(
                    runId,
                    candidateId,
                    raw
                  )
                  // A preview from a newer tab cannot authorize overwriting this draft.
                  if (
                    found.version !== saved.version ||
                    found.context_key !== saved.context_key
                  )
                    throw new Error(
                      'This list or brief changed. Close and reopen research before importing.'
                    )
                  setPreview(found)
                  setSelected(found.changes.map((change) => change.field))
                  setFactIds(found.packet.facts.map((fact) => fact.id))
                  setImportKey(crypto.randomUUID())
                })
              }
            >
              Preview import
            </button>
            {dirty && <p>Save brief edits before previewing an import.</p>}
          </aside>
          <div className="lp-workspace-brief">
            <div className="lp-workspace-heading">
              <h4>Research brief</h4>
              <span role="status">
                {ready ? 'Core details ready' : 'Two core details needed'}
                {dirty ? ' · unsaved' : ''}
              </span>
            </div>
            <p>
              Why it belongs + what to order or notice are enough. Add depth
              only when useful.
            </p>
            {saved.stale && (
              <p role="alert">
                List context changed since this brief was saved. Review the
                slots before saving again.
              </p>
            )}
            {fields.map((field, index) => (
              <label className="lp-workspace-slot" key={field}>
                <span>
                  {LABELS[field]}{' '}
                  <small>{index < 2 ? 'Required' : 'Optional'}</small>
                </span>
                <textarea
                  aria-label={LABELS[field]}
                  rows={index === 1 ? 4 : 3}
                  value={printable(draft[field])}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value
                    setDraft({
                      ...draft,
                      [field]:
                        field === 'what_to_order_or_notice'
                          ? value.split('\n')
                          : value || null
                    })
                  }}
                  onBlur={() => {
                    if (field === 'what_to_order_or_notice')
                      setDraft(
                        (current) =>
                          current && {
                            ...current,
                            what_to_order_or_notice:
                              current.what_to_order_or_notice
                                .map((v) => v.trim())
                                .filter(Boolean)
                          }
                      )
                  }}
                />
                {field === 'what_to_order_or_notice' && (
                  <small>One detail per line.</small>
                )}
              </label>
            ))}
            <button
              className="lp-tool"
              disabled={busy || !dirty}
              onClick={() =>
                void action(async () => {
                  // Blank lines are layout, not details; the server refuses empty ones.
                  const clean = {
                    ...draft,
                    what_to_order_or_notice: draft.what_to_order_or_notice
                      .map((v) => v.trim())
                      .filter(Boolean)
                  }
                  const changes = Object.fromEntries(
                    fields
                      .filter(
                        (field) =>
                          JSON.stringify(clean[field]) !==
                          JSON.stringify(saved.slots[field])
                      )
                      .map((field) => [field, clean[field]])
                  )
                  await accept(
                    await saveResearchWorkspace(runId, candidateId, {
                      version: saved.version,
                      context_key: saved.context_key,
                      slots: changes
                    })
                  )
                  setNotice('Research brief saved.')
                })
              }
            >
              Save brief
            </button>
            <BlurbSection
              saved={saved}
              text={blurbText}
              busy={busy}
              briefDirty={dirty}
              onText={setBlurbText}
              onCopy={() =>
                void action(async () => {
                  await navigator.clipboard.writeText(saved.blurb?.prompt ?? '')
                  setNotice('Blurb prompt copied.')
                })
              }
              onSave={() =>
                void action(async () => {
                  await accept(
                    await saveEntryBlurb(runId, candidateId, {
                      version: saved.blurb?.version ?? 0,
                      text: blurbText
                    })
                  )
                  setNotice('Blurb saved.')
                })
              }
            />
          </div>
          <aside className="lp-workspace-sources">
            <h4>Source shelf</h4>
            <p>
              Useful sources first. Imported facts stay unchecked until
              verified.
            </p>
            {useful.length === 0 && (
              <p>
                No brief sources yet. Import a packet or keep findings in
                Automated research.
              </p>
            )}
            {useful.map((finding) => (
              <div className="lp-workspace-source" key={finding.finding_id}>
                <p>{finding.text}</p>
                <small>
                  {finding.validation.replace(/_/g, ' ')} ·{' '}
                  {finding.event_date ||
                    finding.source_published_at ||
                    'date unknown'}
                </small>
                {finding.evidence.map(
                  (source, index) =>
                    source.url && (
                      <a
                        key={index}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {source.publisher || 'Open source'}
                      </a>
                    )
                )}
              </div>
            ))}
            {unused.length > 0 && (
              <details>
                <summary>Other retained material ({unused.length})</summary>
                {unused.map((finding) => (
                  <p key={finding.finding_id}>
                    {finding.text} <small>({finding.curation})</small>
                  </p>
                ))}
              </details>
            )}
            {!!saved.imports?.length && (
              <details>
                <summary>Import notes ({saved.imports.length})</summary>
                {saved.imports.map((item) => (
                  <div key={item.import_key}>
                    <small>{item.created_at}</small>
                    {item.stale_or_rejected_claims.map((claim, i) => (
                      <p key={i}>
                        {claim.claim} — {claim.reason}
                      </p>
                    ))}
                    {item.open_questions.map((question, i) => (
                      <p key={i}>Open: {question}</p>
                    ))}
                  </div>
                ))}
              </details>
            )}
          </aside>
          {preview && (
            <section
              ref={previewPanel}
              className="lp-workspace-preview"
              aria-label="Import preview"
            >
              <h4>Review import</h4>
              {preview.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
              <p>
                Branch: {preview.packet.identity_match.status} —{' '}
                {preview.packet.identity_match.note}
              </p>
              <p>
                Fit: {preview.packet.fit.status} — {preview.packet.fit.why}
              </p>
              <h5>Brief changes</h5>
              {preview.changes.map((change) => (
                <label className="lp-workspace-change" key={change.field}>
                  <input
                    type="checkbox"
                    checked={selected.includes(change.field)}
                    disabled={busy}
                    onChange={(event) => {
                      setSelected(
                        event.target.checked
                          ? [...selected, change.field]
                          : selected.filter((field) => field !== change.field)
                      )
                      setImportKey(crypto.randomUUID())
                    }}
                  />
                  <strong>{LABELS[change.field]}</strong>
                  <span>Saved: {printable(change.before) || '(empty)'}</span>
                  <span>Proposed: {printable(change.after) || '(empty)'}</span>
                </label>
              ))}
              <h5>Supporting facts</h5>
              <p>
                Selected facts support the imported packet as a whole. Review
                each source before using its claim.
              </p>
              {preview.packet.facts.map((fact) => (
                <label className="lp-workspace-change" key={fact.id}>
                  <input
                    type="checkbox"
                    checked={factIds.includes(fact.id)}
                    disabled={busy}
                    onChange={(event) => {
                      setFactIds(
                        event.target.checked
                          ? [...factIds, fact.id]
                          : factIds.filter((id) => id !== fact.id)
                      )
                      setImportKey(crypto.randomUUID())
                    }}
                  />
                  <strong>{fact.text}</strong>
                  <span>
                    {fact.scope} · {fact.temporal_type} ·{' '}
                    {fact.observed_or_published_at || 'date unknown'}
                  </span>
                  <a
                    href={fact.source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {fact.source.publisher || fact.source.url}
                  </a>
                </label>
              ))}
              {preview.packet.stale_or_rejected_claims.length > 0 && (
                <details>
                  <summary>Stale or rejected claims</summary>
                  {preview.packet.stale_or_rejected_claims.map(
                    (claim, index) => (
                      <p key={index}>
                        {claim.claim} — {claim.reason}
                      </p>
                    )
                  )}
                </details>
              )}
              {preview.packet.open_questions.length > 0 && (
                <details>
                  <summary>Open questions</summary>
                  {preview.packet.open_questions.map((q, i) => (
                    <p key={i}>{q}</p>
                  ))}
                </details>
              )}
              <button
                className="lp-tool"
                disabled={
                  busy || dirty || !preview.can_apply || !factIds.length
                }
                onClick={() =>
                  void action(async () => {
                    await accept(
                      await applyResearchImport(runId, candidateId, {
                        raw_json: raw,
                        version: preview.version,
                        context_key: preview.context_key,
                        import_key: importKey,
                        fields: selected,
                        fact_ids: factIds
                      })
                    )
                    setNotice(
                      'Selected research applied. All slots remain editable.'
                    )
                  })
                }
              >
                Apply selected research
              </button>
            </section>
          )}
        </>
      )}
    </section>
  )
}

function BlurbSection({
  saved,
  text,
  busy,
  briefDirty,
  onText,
  onCopy,
  onSave
}: {
  saved: EntryResearchWorkspace
  text: string
  busy: boolean
  briefDirty: boolean
  onText: (text: string) => void
  onCopy: () => void
  onSave: () => void
}) {
  const blurb = saved.blurb
  if (!blurb) return null
  const changed = text.trim() !== blurb.text
  const canCopy = saved.ready && !briefDirty
  return (
    <section className="lp-workspace-blurb" aria-label="Blurb">
      <div className="lp-workspace-heading">
        <h4>Blurb</h4>
        <span>
          {blurb.text ? 'Saved' : 'Not written yet'}
          {blurb.stale ? ' · brief changed since' : ''}
        </span>
      </div>
      <p>
        Copy this place&apos;s prompt into your strongest model, then paste the
        blurb back. One place at a time.
      </p>
      <button className="lp-tool" disabled={busy || !canCopy} onClick={onCopy}>
        Copy blurb prompt
      </button>
      {!saved.ready && <p>Fill in the two required details first.</p>}
      {briefDirty && saved.ready && (
        <p>Save brief edits first so the prompt matches them.</p>
      )}
      {canCopy && (
        <details>
          <summary>View blurb prompt</summary>
          <pre className="lp-workspace-prompt">{blurb.prompt}</pre>
        </details>
      )}
      <textarea
        aria-label="Blurb text"
        placeholder="Paste the blurb here, or write it yourself."
        rows={6}
        value={text}
        disabled={busy}
        onChange={(event) => onText(event.target.value)}
      />
      <button
        className="lp-tool"
        disabled={busy || briefDirty || !changed || !text.trim()}
        onClick={onSave}
      >
        Save blurb
      </button>
    </section>
  )
}
