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
import { revealSoon, scrollModalToTop } from '../revealInModal'

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
  const [step, setStep] = useState<'research' | 'blurb'>('research')
  const [showPrompt, setShowPrompt] = useState(false)
  const [blurbText, setBlurbText] = useState('')
  // Part 1 folds away once the brief has what it needs, so a finished place
  // opens on its result rather than on the steps that produced it.
  const [gatherOpen, setGatherOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [imported, setImported] = useState(false)
  const root = useRef<HTMLElement>(null)
  const gather = useRef<HTMLElement>(null)
  const promptBox = useRef<HTMLTextAreaElement>(null)
  const brief = useRef<HTMLElement>(null)
  // The pop-up is one fixed size, so whatever opens is scrolled to.
  useEffect(() => {
    if (preview) revealSoon(() => previewPanel.current, 'start')
  }, [preview])
  useEffect(() => {
    scrollModalToTop(root.current)
  }, [step])
  const dirty = !!saved && JSON.stringify(saved.slots) !== JSON.stringify(draft)

  useEffect(() => {
    let live = true
    void openResearchWorkspace(runId, candidateId)
      .then(async (view) => {
        if (!live) return
        setStep(view.ready && !view.stale ? 'blurb' : 'research')
        setGatherOpen(!view.ready || view.stale)
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
      .then((profile) => {
        if (live) setResearch(profile)
      })
      .catch((error) => {
        if (live)
          setError(
            error instanceof Error ? error.message : 'Could not load sources.'
          )
      })
    return () => {
      live = false
    }
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
    <section
      ref={root}
      className="lp-workspace"
      aria-label="Research workspace"
    >
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
          <nav className="lp-workspace-tabs" aria-label="Place editor steps">
            <button
              aria-label="Research"
              aria-pressed={step === 'research'}
              onClick={() => setStep('research')}
            >
              <StageMark done={saved.ready && !saved.stale} number={1} />
              <span className="lp-stage-text">
                <span className="lp-stage-name">Research</span>
                <span className="lp-stage-state">
                  {saved.ready && !saved.stale
                    ? 'Brief filled in'
                    : 'Fill in the brief'}
                </span>
              </span>
            </button>
            <span className="lp-stage-join" aria-hidden="true" />
            <button
              aria-label="Blurb"
              aria-pressed={step === 'blurb'}
              onClick={() => setStep('blurb')}
            >
              <StageMark
                done={!!saved.blurb?.text && !saved.blurb.stale}
                number={2}
              />
              <span className="lp-stage-text">
                <span className="lp-stage-name">Blurb</span>
                <span className="lp-stage-state">
                  {saved.blurb?.text ? 'Written' : 'Not written yet'}
                </span>
              </span>
            </button>
          </nav>
          <section
            ref={gather}
            className="lp-gather"
            aria-label="Get research"
            hidden={step !== 'research'}
          >
            <header className="lp-gather-head">
              <div>
                <p className="lp-part-kicker">Part 1</p>
                <h4>Get research</h4>
                <p>
                  {gatherOpen
                    ? 'Ask a model that can search the web, then bring its answer back here.'
                    : 'The brief already has its core details. Get more only to add to it.'}
                </p>
              </div>
              {saved.ready && (
                <button
                  className="lp-tool"
                  aria-expanded={gatherOpen}
                  onClick={() => {
                    setGatherOpen(!gatherOpen)
                    if (!gatherOpen) revealSoon(() => gather.current)
                  }}
                >
                  {gatherOpen ? 'Hide steps' : 'Get more research'}
                </button>
              )}
            </header>
            {gatherOpen && (
              <ol className="lp-flow">
                <li
                  className={
                    copied ? 'lp-flow-step lp-flow-done' : 'lp-flow-step'
                  }
                >
                  <FlowMark number={1} done={copied} />
                  <div className="lp-flow-body">
                    <h5>Copy the research prompt</h5>
                    <div className="lp-workspace-actions">
                      <CopyButton
                        label="Copy research prompt"
                        text={saved.prompt}
                        onCopied={() => setCopied(true)}
                      />
                      <button
                        className="lp-link-button"
                        aria-expanded={showPrompt}
                        onClick={() => {
                          setShowPrompt(!showPrompt)
                          if (!showPrompt) revealSoon(() => promptBox.current)
                        }}
                      >
                        {showPrompt ? 'Hide prompt' : 'View research prompt'}
                      </button>
                    </div>
                    {showPrompt && (
                      <textarea
                        readOnly
                        ref={promptBox}
                        aria-label="Research prompt"
                        value={saved.prompt}
                        rows={12}
                      />
                    )}
                  </div>
                </li>
                <li className="lp-flow-step">
                  <FlowMark number={2} done={!!preview} />
                  <div className="lp-flow-body">
                    <h5>Paste what the model sends back</h5>
                    <textarea
                      aria-label="Paste research JSON"
                      placeholder="Paste the JSON here. The code block's copy button keeps it exact."
                      rows={4}
                      value={raw}
                      disabled={busy}
                      onChange={(event) => {
                        setRaw(event.target.value)
                        setPreview(null)
                        setImportKey('')
                      }}
                    />
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
                          setSelected(
                            found.changes.map((change) => change.field)
                          )
                          setFactIds(found.packet.facts.map((fact) => fact.id))
                          setImportKey(crypto.randomUUID())
                        })
                      }
                    >
                      Preview import
                    </button>
                    {dirty && (
                      <p>Save brief edits before previewing an import.</p>
                    )}
                  </div>
                </li>
                <li
                  className={
                    preview ? 'lp-flow-step' : 'lp-flow-step lp-flow-waiting'
                  }
                >
                  <FlowMark number={3} done={imported} />
                  <div className="lp-flow-body">
                    <h5>Choose what goes into the brief</h5>
                    {!preview && (
                      <p className="lp-flow-hint">
                        {imported
                          ? 'Applied. Check the brief below.'
                          : 'Appears after you preview an import.'}
                      </p>
                    )}
                    {preview && (
                      <section
                        ref={previewPanel}
                        className="lp-workspace-preview"
                        aria-label="Import preview"
                      >
                        {preview.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                        <p>
                          Branch: {preview.packet.identity_match.status} —{' '}
                          {preview.packet.identity_match.note}
                        </p>
                        <p>
                          Fit: {preview.packet.fit.status} —{' '}
                          {preview.packet.fit.why}
                        </p>
                        <h5>Brief changes</h5>
                        {preview.changes.map((change) => (
                          <label
                            className="lp-workspace-change"
                            key={change.field}
                          >
                            <input
                              type="checkbox"
                              checked={selected.includes(change.field)}
                              disabled={busy}
                              onChange={(event) => {
                                setSelected(
                                  event.target.checked
                                    ? [...selected, change.field]
                                    : selected.filter(
                                        (field) => field !== change.field
                                      )
                                )
                                setImportKey(crypto.randomUUID())
                              }}
                            />
                            <strong>{LABELS[change.field]}</strong>
                            <span>
                              Saved: {printable(change.before) || '(empty)'}
                            </span>
                            <span>
                              Proposed: {printable(change.after) || '(empty)'}
                            </span>
                          </label>
                        ))}
                        <h5>Supporting facts</h5>
                        <p>
                          Selected facts support the imported packet as a whole.
                          Review each source before using its claim.
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
                            busy ||
                            dirty ||
                            !preview.can_apply ||
                            !factIds.length
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
                              setImported(true)
                              // The result is what to look at next.
                              revealSoon(() => brief.current, 'start')
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
                  </div>
                </li>
              </ol>
            )}
          </section>
          <div
            className="lp-handoff"
            aria-hidden="true"
            hidden={step !== 'research'}
          >
            <span>Research fills in the brief</span>
          </div>
          <div className="lp-workspace-brief">
            <section
              ref={brief}
              className="lp-brief"
              aria-label="Research brief"
              hidden={step !== 'research'}
            >
              <header className="lp-brief-head">
                <div>
                  <p className="lp-part-kicker">Part 2</p>
                  <h4>Research brief</h4>
                  <p>
                    What the blurb is written from. Everything here stays
                    editable.
                  </p>
                </div>
                <span
                  role="status"
                  className={ready ? 'lp-workspace-pill-ready' : undefined}
                >
                  {ready ? 'Core details ready' : 'Two core details needed'}
                  {dirty ? ' · unsaved' : ''}
                </span>
              </header>
              {saved.stale && (
                <p role="alert">
                  List context changed since this brief was saved. Review the
                  slots before saving again.
                </p>
              )}
              {fields.slice(0, 2).map((field, index) => (
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
              <details>
                <summary>Optional details</summary>
                {fields.slice(2).map((field) => (
                  <label className="lp-workspace-slot" key={field}>
                    <span>{LABELS[field]}</span>
                    <textarea
                      aria-label={LABELS[field]}
                      rows={3}
                      value={printable(draft[field])}
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          [field]: event.target.value || null
                        })
                      }
                    />
                  </label>
                ))}
              </details>
              <footer className="lp-brief-foot">
                <div className="lp-workspace-actions">
                  <button
                    className="lp-tool"
                    disabled={busy || (!dirty && !saved.stale)}
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
                  {saved.ready && !dirty && (
                    <button
                      className="lp-tool lp-tool-primary"
                      onClick={() => setStep('blurb')}
                    >
                      Continue to blurb
                    </button>
                  )}
                </div>
              </footer>
            </section>
            <div hidden={step !== 'blurb'}>
              <BlurbSection
                saved={saved}
                text={blurbText}
                busy={busy}
                briefDirty={dirty}
                onText={setBlurbText}
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
          </div>
          <details className="lp-workspace-sources">
            <summary>Supporting research</summary>
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
          </details>
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
  onSave
}: {
  saved: EntryResearchWorkspace
  text: string
  busy: boolean
  briefDirty: boolean
  onText: (text: string) => void
  onSave: () => void
}) {
  const [showPrompt, setShowPrompt] = useState(false)
  const blurbPrompt = useRef<HTMLPreElement>(null)
  const blurb = saved.blurb
  if (!blurb) return null
  const changed = text.trim() !== blurb.text
  const canCopy = saved.ready && !saved.stale && !briefDirty
  return (
    <section className="lp-workspace-blurb" aria-label="Blurb">
      <section className="lp-gather" aria-label="Get the blurb">
        <header className="lp-gather-head">
          <div>
            <p className="lp-part-kicker">Part 1</p>
            <h4>Get the blurb</h4>
            <p>
              Run this place&apos;s prompt in your strongest model, one place at
              a time.
            </p>
          </div>
        </header>
        <ol className="lp-flow">
          <li className="lp-flow-step">
            <FlowMark number={1} done={!!blurb.text} />
            <div className="lp-flow-body">
              <h5>Copy the blurb prompt</h5>
              {saved.stale && (
                <p className="lp-flow-hint">
                  List context changed. Review and save research first.
                </p>
              )}
              {!saved.ready && (
                <p className="lp-flow-hint">
                  Fill in the two required details first.
                </p>
              )}
              {briefDirty && saved.ready && (
                <p className="lp-flow-hint">
                  Save brief edits first so the prompt matches them.
                </p>
              )}
              <div className="lp-workspace-actions">
                <CopyButton
                  label="Copy blurb prompt"
                  text={blurb.prompt}
                  disabled={busy || !canCopy}
                />
                {canCopy && (
                  <button
                    className="lp-link-button"
                    aria-expanded={showPrompt}
                    onClick={() => {
                      setShowPrompt(!showPrompt)
                      if (!showPrompt) revealSoon(() => blurbPrompt.current)
                    }}
                  >
                    {showPrompt ? 'Hide prompt' : 'View blurb prompt'}
                  </button>
                )}
              </div>
              {canCopy && showPrompt && (
                <pre ref={blurbPrompt} className="lp-workspace-prompt">
                  {blurb.prompt}
                </pre>
              )}
            </div>
          </li>
          <li className="lp-flow-step">
            <FlowMark number={2} done={!!blurb.text && !changed} />
            <div className="lp-flow-body">
              <h5>Paste the answer into the blurb below</h5>
            </div>
          </li>
        </ol>
      </section>
      <div className="lp-handoff" aria-hidden="true">
        <span>The answer becomes the blurb</span>
      </div>
      <section className="lp-brief" aria-label="Blurb text editor">
        <header className="lp-brief-head">
          <div>
            <p className="lp-part-kicker">Part 2</p>
            <h4>The blurb</h4>
            <p>What goes on the list. Edit it freely before saving.</p>
          </div>
          <span className={blurb.text ? 'lp-workspace-pill-ready' : undefined}>
            {blurb.text ? 'Blurb ready' : 'Not written yet'}
            {blurb.stale || saved.stale ? ' · review needed' : ''}
          </span>
        </header>
        <textarea
          aria-label="Blurb text"
          placeholder="Paste the blurb here, or write it yourself."
          rows={8}
          value={text}
          disabled={busy}
          onChange={(event) => onText(event.target.value)}
        />
        <footer className="lp-brief-foot">
          <button
            className="lp-tool lp-tool-primary"
            disabled={
              busy ||
              briefDirty ||
              saved.stale ||
              (!changed && !blurb.stale) ||
              !text.trim()
            }
            onClick={onSave}
          >
            {blurb.stale && !changed ? 'Confirm blurb' : 'Save blurb'}
          </button>
        </footer>
      </section>
    </section>
  )
}

/** Where a stage of the place stands: its number until it is done, then a tick. */
function StageMark({ number, done }: { number: number; done: boolean }) {
  return (
    <span
      className={done ? 'lp-stage-mark lp-stage-mark-done' : 'lp-stage-mark'}
      aria-hidden="true"
    >
      {done ? <Tick /> : number}
    </span>
  )
}

export function FlowMark({ number, done }: { number: number; done: boolean }) {
  return (
    <span
      className={done ? 'lp-flow-mark lp-flow-mark-done' : 'lp-flow-mark'}
      aria-hidden="true"
    >
      {done ? <Tick /> : number}
    </span>
  )
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11">
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A copy button that answers on itself. The label turns into "Copied" for a
 *  moment, in the same footprint, so nothing around it moves. */
export function CopyButton({
  label,
  text,
  disabled,
  onCopied
}: {
  label: string
  text: string
  disabled?: boolean
  onCopied?: () => void
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const timer = window.setTimeout(() => setState('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [state])
  const shown =
    state === 'copied'
      ? 'Copied'
      : state === 'failed'
        ? 'Could not copy'
        : label
  return (
    <button
      className={`lp-tool lp-tool-primary lp-copy lp-copy-${state}`}
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setState('copied')
          onCopied?.()
        } catch {
          setState('failed')
        }
      }}
    >
      {/* Every label is laid out in one cell, so the button is always as wide
          as its longest one. Only the current one is visible or read out. */}
      <span className="lp-copy-labels">
        {[label, 'Copied', 'Could not copy'].map((option) => (
          <span key={option} aria-hidden={option !== shown}>
            {option === 'Copied' && <Tick />}
            {option}
          </span>
        ))}
      </span>
    </button>
  )
}
