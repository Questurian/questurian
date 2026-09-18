import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Save, Upload } from 'lucide-react'
import { ProposalPicks } from './ProposalPicks'
import { Badge, Step } from './Step'
import type { DaySlotView, ImportPreview, ValidationIssue } from '../../dayWork/types'

/**
 * An answer, checked and shown as the proposal it would save.
 *
 * Nothing is saved by checking. The check is small — is it an answer to this
 * day's request, and does it fill every stop once — and the Save is pinned to
 * the exact text that was checked. An in-app run lands here on its own and is
 * shown as places, not JSON.
 */

export interface DayImportPanelProps {
  preview: ImportPreview | null
  /** The answer an in-app run returned for the current request. */
  researched: string
  slots: DaySlotView[]
  tone: 'waiting' | 'active' | 'done'
  busy: boolean
  previewing: boolean
  applying: boolean
  canImport: boolean
  hasSavedResult: boolean
  onPreview: (raw: string) => void
  onClear: () => void
  onApply: (raw: string, contentHash: string) => void
  announce: (message: string) => void
}

export function DayImportPanel({
  preview,
  researched,
  slots,
  tone,
  busy,
  previewing,
  applying,
  canImport,
  hasSavedResult,
  onPreview,
  onClear,
  onApply,
  announce,
}: DayImportPanelProps) {
  const [raw, setRaw] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const checkedRef = useRef('')

  // A finished run lands here and checks itself, once per answer.
  useEffect(() => {
    if (!researched || checkedRef.current === researched) return
    checkedRef.current = researched
    setRaw(researched)
    onPreview(researched)
  }, [researched, onPreview])

  // Typing after a check drops it: a Save must match what was checked.
  function edit(next: string) {
    setRaw(next)
    if (preview) onClear()
  }

  async function readFile(file: File) {
    edit(await file.text())
    announce(`Loaded ${file.name}. Check it before saving.`)
  }

  async function copyRepair() {
    if (!preview?.repair_prompt) return
    try {
      await navigator.clipboard.writeText(preview.repair_prompt)
      announce('The fix-it prompt is on your clipboard.')
    } catch {
      announce('This browser blocked the clipboard.')
    }
  }

  const errors = preview?.report.issues.filter(issue => issue.severity === 'error') ?? []
  const warnings = preview?.report.issues.filter(issue => issue.severity === 'warning') ?? []
  const completeness = preview?.report.completeness
  const fromRun = Boolean(researched) && raw === researched
  const shown = preview?.valid ? preview.selection : null

  function issueList(issues: ValidationIssue[], tone: string) {
    return (
      <ul className="ip-issues">
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`} className={tone}>
            {issue.path ? <span className="ip-issue-path">{issue.path}</span> : null}
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    )
  }

  const pasteBox = (
    <>
      <label className="ip-sr-only" htmlFor="ip-paste">
        The returned JSON
      </label>
      <textarea
        id="ip-paste"
        className="ip-paste"
        value={raw}
        placeholder="{ …the whole JSON object… }"
        spellCheck={false}
        disabled={busy}
        onChange={event => edit(event.target.value)}
      />
      <div className="ip-answer-actions">
        <p className="ip-answer-hint">
          A surrounding ``` fence is fine. Anything else around the object is reported, not guessed at.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          className="ip-sr-only"
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) void readFile(file)
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className="ip-button-quiet"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <Upload size={15} aria-hidden /> Load a file
        </button>
      </div>
    </>
  )

  return (
    <Step
      id="ip-import"
      title="New proposal"
      tone={tone}
      badge={
        preview ? (
          preview.valid ? (
            completeness?.complete ? (
              <Badge tone="done">Every stop filled</Badge>
            ) : (
              <Badge tone="warning">Has open stops</Badge>
            )
          ) : (
            <Badge tone="error">
              {errors.length} problem{errors.length === 1 ? '' : 's'}
            </Badge>
          )
        ) : (
          <Badge tone="quiet">Nothing to check</Badge>
        )
      }
      lead={
        researched
          ? 'The places are back. Look at them, then save — nothing is saved until you do.'
          : 'Paste the JSON another tool returned, or load it from a file. Checking changes nothing until you save.'
      }
      actions={
        <>
          <button
            type="button"
            className="ip-button-quiet"
            onClick={() => onPreview(raw)}
            disabled={busy || !raw.trim() || !canImport}
          >
            {previewing ? 'Checking…' : 'Check it'}
          </button>
          {preview?.valid ? (
            <button
              type="button"
              className="ip-button-primary"
              onClick={() => onApply(raw, preview.content_hash)}
              disabled={busy}
            >
              <Save size={16} aria-hidden />
              {applying ? 'Saving…' : 'Save this proposal'}
            </button>
          ) : null}
          {preview?.valid && hasSavedResult ? (
            <span className="ip-helper">It becomes the current version; earlier ones are kept.</span>
          ) : null}
          {preview?.repair_prompt ? (
            <button type="button" className="ip-button-quiet" onClick={copyRepair}>
              <ClipboardCopy size={15} aria-hidden /> Copy a fix-it prompt
            </button>
          ) : null}
          {!canImport ? (
            <span className="ip-helper">Available once a request has been built for this day.</span>
          ) : null}
        </>
      }
    >
      {fromRun ? (
        <details className="ip-disclosure">
          <summary>
            The answer as JSON{' '}
            <span className="ip-disclosure-note">edit it and it counts as your text</span>
          </summary>
          {pasteBox}
        </details>
      ) : (
        pasteBox
      )}

      {preview ? (
        <>
          {preview.report.normalizations.length > 0 ? (
            <p className="ip-helper">Before checking: {preview.report.normalizations.join(' ')}</p>
          ) : null}

          {preview.valid && preview.changes.length > 0 ? (
            <>
              <h4 className="ip-issue-group">What saving this would change</h4>
              <ul className="ip-changes">
                {preview.changes.map(change => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </>
          ) : null}

          {shown ? (
            <div className="ip-proposal">
              <p className="ip-proposal-overview">{shown.overview}</p>
              {shown.tripFit ? <p className="ip-proposal-fit">{shown.tripFit}</p> : null}
              {shown.questions.length > 0 ? (
                <ul className="ip-questions-plain">
                  {shown.questions.map(question => (
                    <li key={question.question}>{question.question}</li>
                  ))}
                </ul>
              ) : null}
              <ProposalPicks selection={shown} slots={slots} />
            </div>
          ) : null}

          {errors.length > 0 ? (
            <>
              <h4 className="ip-issue-group">
                <AlertTriangle size={13} aria-hidden /> These stop it being saved
              </h4>
              {issueList(errors, 'ip-issue')}
            </>
          ) : null}

          {warnings.length > 0 ? (
            <details className="ip-disclosure">
              <summary>
                Worth a look{' '}
                <span className="ip-disclosure-note">{warnings.length} · none blocks saving</span>
              </summary>
              {issueList(warnings, 'ip-issue ip-issue-note')}
            </details>
          ) : null}
        </>
      ) : null}
    </Step>
  )
}
