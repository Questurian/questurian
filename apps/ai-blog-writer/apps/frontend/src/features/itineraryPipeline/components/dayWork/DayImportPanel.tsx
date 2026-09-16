import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Save, Upload } from 'lucide-react'
import { AttentionPanel } from './AttentionPanel'
import { DayArticle } from './DayArticle'
import { Badge, Step } from './Step'
import { attentionFor, openCountByLabel, plainIssueMessage, stopNames } from './attention'
import type { DaySlotView, ImportPreview, ValidationIssue } from '../../dayWork/types'

/**
 * Paste what the external model returned, and see what it would do.
 *
 * Nothing is saved by pasting. The preview is a full server-side check — the
 * shape, whether it answers this day's request, whether every stop is there
 * once, whether the evidence resolves and whether the clock adds up — and the
 * Save is pinned to the exact text that was checked. Editing the box after a
 * preview invalidates it rather than saving something nobody looked at.
 *
 * A valid result is saveable even when it is incomplete, and it says which one
 * it is. Research that found five of six places is progress worth keeping, and
 * calling it a finished day is the lie this distinction exists to prevent.
 *
 * A valid answer is shown as the day it would save — places, order and
 * paragraphs — with what would keep it open above it, so the decision to save
 * is made looking at the day rather than at a list of checks. The raw JSON of
 * an in-app run is folded: it is there to inspect, not to read.
 */

const LAYER_LABELS: Record<string, string> = {
  transport: 'Reading the paste',
  schema: 'The shape of the answer',
  identity: 'Which request this answers',
  structure: 'The stops',
  evidence: 'Sources and claims',
  schedule: 'The clock',
  review: 'Worth a look',
}

export interface DayImportPanelProps {
  preview: ImportPreview | null
  /** The answer an in-app research run returned for the current prompt. It
   *  arrives here exactly as a paste would, and is checked the same way. */
  researched: string
  slots: DaySlotView[]
  /** Why each stop is in the day, by slot id. */
  roles: Map<string, string>
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
  roles,
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

  /**
   * A finished research run lands in the box and checks itself.
   *
   * It goes through the same preview as a paste rather than straight to the
   * day, because the app has not verified anything by running the call itself
   * — it has only saved the operator a copy and a paste. The review is the
   * point of this step and it does not move.
   *
   * Checked once per answer: `checkedRef` remembers which text was already
   * sent, so the poll that delivered it does not re-check it every five
   * seconds, and an operator editing it afterwards is left alone.
   */
  useEffect(() => {
    if (!researched || checkedRef.current === researched) return
    checkedRef.current = researched
    setRaw(researched)
    onPreview(researched)
  }, [researched, onPreview])

  // The preview describes exactly this text. Typing after previewing is how
  // somebody saves something nobody checked, so the preview is dropped the
  // moment the text moves.
  function edit(next: string) {
    setRaw(next)
    if (preview) onClear()
  }

  async function readFile(file: File) {
    const text = await file.text()
    edit(text)
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
  const warnings =
    preview?.report.issues.filter(issue => issue.severity === 'warning') ?? []
  const completeness = preview?.report.completeness
  const names = preview?.valid && preview.result ? stopNames(preview.result, slots) : null
  const attention =
    preview?.valid && preview.result && names
      ? attentionFor(preview.result, preview.report, names)
      : null
  // The unedited answer of an in-app run is read as a day, not as JSON.
  const fromRun = Boolean(researched) && raw === researched

  function issueList(issues: ValidationIssue[], tone: string) {
    return (
      <ul className="ip-issues">
        {issues.map((issue, index) => (
          <li key={`${issue.path}-${index}`} className={tone}>
            <span className="ip-issue-path">
              {issue.path || LAYER_LABELS[issue.layer] || issue.layer}
            </span>
            <span>{plainIssueMessage(issue.message)}</span>
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
            A surrounding ``` fence is fine. Anything else around the object is not
            — it will be reported rather than guessed at.
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
      title="Review and save"
      tone={tone}
      badge={
        preview ? (
          preview.valid ? (
            completeness?.complete ? (
              <Badge tone="done">Checks out · complete</Badge>
            ) : (
              <Badge tone="warning">Checks out · needs work</Badge>
            )
          ) : (
            <Badge tone="error">
              {errors.length} problem{errors.length === 1 ? '' : 's'}
            </Badge>
          )
        ) : hasSavedResult ? (
          <Badge tone="quiet">A day is already saved</Badge>
        ) : (
          <Badge tone="quiet">Nothing pasted</Badge>
        )
      }
      lead={
        researched
          ? 'Research finished and the app has checked its answer. Read the day below, then save it — nothing is saved until you do.'
          : 'Paste the whole JSON object the external model returned, or load it from a file. Answers to older prompts are still read in their own format. Checking it changes nothing until you save.'
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
              {applying
                ? 'Saving…'
                : completeness?.complete
                  ? 'Save this day'
                  : 'Save as needs work'}
            </button>
          ) : null}
          {preview?.valid ? (
            <span className="ip-helper">
              {completeness?.complete
                ? 'Saves the day as complete for planning. Its sources still need your review.'
                : 'Saves the day as a draft that still needs work. You can replace it later with a new answer.'}
              {hasSavedResult ? ' It replaces the saved version; earlier versions are kept.' : ''}
            </span>
          ) : null}
          {preview?.repair_prompt ? (
            <button type="button" className="ip-button-quiet" onClick={copyRepair}>
              <ClipboardCopy size={15} aria-hidden /> Copy a fix-it prompt
            </button>
          ) : null}
          {!canImport ? (
            <span className="ip-helper">
              Available once a research prompt has been built for this day.
            </span>
          ) : null}
        </>
      }
    >
      {fromRun ? (
        <details className="ip-disclosure">
          <summary>
            The answer as JSON{' '}
            <span className="ip-disclosure-note">
              what the run returned · edit it and it counts as your text
            </span>
          </summary>
          {pasteBox}
        </details>
      ) : (
        pasteBox
      )}

      {preview ? (
        <>
          {preview.report.normalizations.length > 0 ? (
            <p className="ip-helper">
              Before checking: {preview.report.normalizations.join(' ')}
            </p>
          ) : null}

          {preview.changes.length > 0 ? (
            <>
              <h4 className="ip-issue-group">What saving this would change</h4>
              <ul className="ip-changes">
                {preview.changes.map(change => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </>
          ) : null}

          {preview.valid && completeness && !attention ? (
            <p className="ip-thread-progress">
              {completeness.selected} stop
              {completeness.selected === 1 ? '' : 's'} chosen
              {completeness.unresolved > 0
                ? `, ${completeness.unresolved} unresolved`
                : ''}
              {completeness.omitted_optional > 0
                ? `, ${completeness.omitted_optional} optional stop dropped`
                : ''}
              .
              {completeness.required_unresolved.length > 0
                ? ` Still open: ${completeness.required_unresolved.join(', ')}.`
                : ''}
              {completeness.missing_timing.length > 0
                ? ` No time yet for: ${completeness.missing_timing.join(', ')}.`
                : ''}
              {completeness.outstanding_checks.length > 0
                ? ` It could not settle: ${completeness.outstanding_checks.join('; ')}.`
                : ''}
              {(completeness.missing_legs ?? []).length > 0
                ? ` No journey with a known time: ${(completeness.missing_legs ?? []).join(', ')}.`
                : ''}
              {(completeness.schedule_conflicts ?? []).length > 0
                ? ` The clock does not fit: ${(completeness.schedule_conflicts ?? []).join(', ')}.`
                : ''}
            </p>
          ) : null}

          {attention && preview.result && names ? (
            <>
              <p className="ip-thread-progress">
                {completeness?.complete
                  ? 'Complete for planning if saved: every required stop is chosen and timed.'
                  : 'Can be saved now, as a day that still needs work.'}
              </p>
              <AttentionPanel
                attention={attention}
                headingId="ip-preview-attention-heading"
                savedWord="can still be saved"
              />
              <DayArticle
                result={preview.result}
                slots={slots}
                roles={roles}
                openByLabel={openCountByLabel(attention.blocking, names)}
              />
            </>
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
            attention ? (
              <details className="ip-disclosure">
                <summary>
                  Every check the app ran{' '}
                  <span className="ip-disclosure-note">
                    {warnings.length} · worth a look — none of these blocks saving
                  </span>
                </summary>
                {issueList(warnings, 'ip-issue ip-issue-note')}
              </details>
            ) : (
              <>
                <h4 className="ip-issue-group">
                  Worth a look — none of these blocks saving
                </h4>
                {issueList(warnings, 'ip-issue ip-issue-note')}
              </>
            )
          ) : null}
        </>
      ) : null}
    </Step>
  )
}
