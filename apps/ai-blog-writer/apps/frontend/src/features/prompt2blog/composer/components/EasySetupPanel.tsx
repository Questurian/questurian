import { useEffect, useState } from 'react'
import type { Prompt2BlogInputOptionsResponse } from '../../api'
import type { P2BFormState } from '../composer.types'
import { reviewEasySetupJson, type EasySetupImportReview } from '../easy-setup-import'
import { buildEasySetupPrompt } from '../easy-setup-prompt'

type CopyStatus = 'idle' | 'copied' | 'error'

const COPY_LABELS: Record<CopyStatus, string> = {
  idle: 'Copy prompt',
  copied: 'Copied!',
  error: 'Copy failed',
}

interface EasySetupPanelProps {
  inputOptions: Prompt2BlogInputOptionsResponse | null
  location: string
  title: string
  onApply: (patch: Partial<P2BFormState>) => void
  onLocationChange: (value: string) => void
  onTitleChange: (value: string) => void
}

export function EasySetupPanel({
  inputOptions,
  location,
  title,
  onApply,
  onLocationChange,
  onTitleChange,
}: EasySetupPanelProps) {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [pastedJson, setPastedJson] = useState('')
  const [review, setReview] = useState<EasySetupImportReview | null>(null)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  // The prompt lists the option catalogs verbatim, so a prompt built before
  // they arrived is missing the fields it should have constrained.
  const catalogsLoaded = Boolean(inputOptions?.article_types.length)

  useEffect(() => {
    setPrompt(null)
    setCopyStatus('idle')
  }, [location, title])

  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = setTimeout(() => setCopyStatus('idle'), 2000)
    return () => clearTimeout(timer)
  }, [copyStatus])

  const handleConfirmSetup = () => {
    const confirmedTitle = title.trim()
    const confirmedLocation = location.trim()
    if (!confirmedTitle || !confirmedLocation) return
    setPrompt(buildEasySetupPrompt(confirmedTitle, confirmedLocation, inputOptions))
    setCopyStatus('idle')
  }

  const handleCopyPrompt = () => {
    if (prompt === null) return
    // Clipboard access is missing outside secure contexts, so the button has to
    // say so rather than silently doing nothing.
    const copied = navigator.clipboard?.writeText(prompt)
    if (!copied) {
      setCopyStatus('error')
      return
    }
    copied.then(() => setCopyStatus('copied')).catch(() => setCopyStatus('error'))
  }

  // The review is tied to the exact text it was run against; editing the box
  // retracts the approval so nothing unchecked can reach the form.
  const handlePastedJsonChange = (value: string) => {
    setPastedJson(value)
    setReview(null)
    setAppliedCount(null)
  }

  const handleCheckJson = () => {
    setAppliedCount(null)
    setReview(reviewEasySetupJson(pastedJson, inputOptions))
  }

  const handleApplyJson = () => {
    if (!review?.patch) return
    onApply(review.patch)
    setAppliedCount(Object.keys(review.patch).length)
    setReview(null)
  }

  return (
    <section className="p2b-panel">
      <div className="p2b-panel-header">
        <div className="p2b-panel-header-text">
          <h2>Easy Set Up</h2>
          <p>Generate a structured brief, or import one you already approved.</p>
        </div>
      </div>
      <div className="p2b-panel-body">
        <div className="p2b-subsection-heading">
          <h3>Generate a setup prompt</h3>
          <p>Start with the working title and destination.</p>
        </div>
        <div className="p2b-field-row p2b-field-row--2">
          <div className="p2b-field">
            <label htmlFor="p2b-easy-setup-title">Title</label>
            <input
              id="p2b-easy-setup-title"
              type="text"
              className="p2b-input"
              value={title}
              onChange={event => onTitleChange(event.target.value)}
              placeholder="e.g. A long weekend in Lisbon"
            />
          </div>
          <div className="p2b-field">
            <label htmlFor="p2b-easy-setup-location">Location</label>
            <input
              id="p2b-easy-setup-location"
              type="text"
              className="p2b-input"
              value={location}
              onChange={event => onLocationChange(event.target.value)}
              placeholder="e.g. Lisbon, Portugal"
            />
          </div>
        </div>
        <div className="p2b-panel-actions">
          <button
            type="button"
            className="p2b-submit-btn"
            disabled={!title.trim() || !location.trim()}
            onClick={handleConfirmSetup}
          >
            Generate setup prompt
          </button>
        </div>
        {!catalogsLoaded && (
          <p className="p2b-field-hint">
            Article types, tones, lengths, and brand voices are still loading. Confirm again once
            they arrive so the prompt can list them.
          </p>
        )}
        {prompt !== null && (
          <div className="p2b-field">
            <div className="p2b-field-label-row">
              <label htmlFor="p2b-easy-setup-prompt">Prompt</label>
              <button
                type="button"
                className="p2b-inline-copy-btn"
                onClick={handleCopyPrompt}
              >
                {COPY_LABELS[copyStatus]}
              </button>
            </div>
            <textarea
              id="p2b-easy-setup-prompt"
              className="p2b-textarea"
              rows={24}
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
            />
          </div>
        )}
        <div className="p2b-subsection-heading p2b-subsection-heading--divided">
          <h3>Import an approved brief</h3>
          <p>Validate model JSON before it changes any fields below.</p>
        </div>
        <div className="p2b-field">
          <label htmlFor="p2b-easy-setup-json">Approved JSON</label>
          <textarea
            id="p2b-easy-setup-json"
            className="p2b-textarea"
            rows={10}
            placeholder="Paste the JSON the model returned, then check it before applying."
            value={pastedJson}
            onChange={event => handlePastedJsonChange(event.target.value)}
          />
        </div>
        <div className="p2b-panel-actions">
          <button
            type="button"
            className="p2b-copy-json-btn"
            disabled={!pastedJson.trim()}
            onClick={handleCheckJson}
          >
            Check JSON
          </button>
          <button
            type="button"
            className="p2b-submit-btn"
            disabled={!review?.patch}
            onClick={handleApplyJson}
          >
            Apply to form
          </button>
        </div>
        {appliedCount !== null && (
          <p className="p2b-import-applied" role="status">
            Applied {appliedCount} fields to the form below.
          </p>
        )}
        {review?.direction && (
          <div className="p2b-import-direction">
            <span className="p2b-import-direction-label">Direction</span>
            <p>{review.direction}</p>
          </div>
        )}
        {review !== null && review.issues.length > 0 && (
          <div className="p2b-import-report p2b-import-report--blocked">
            <p className="p2b-import-report-title">
              {review.issues.length} problem{review.issues.length === 1 ? '' : 's'} — nothing was applied.
            </p>
            <ul className="p2b-import-list">
              {review.issues.map(issue => (
                <li key={`${issue.field}-${issue.message}`}>
                  <code>{issue.field}</code> {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {review?.patch && (
          <div className="p2b-import-report">
            <p className="p2b-import-report-title">
              Every value matches the loaded options. Review and apply.
            </p>
            {review.corrections.length > 0 && (
              <ul className="p2b-import-list p2b-import-list--corrections">
                {review.corrections.map(correction => (
                  <li key={`${correction.field}-${correction.message}`}>
                    <code>{correction.field}</code> {correction.message}
                  </li>
                ))}
              </ul>
            )}
            <dl className="p2b-import-rows">
              {review.rows.map(row => (
                <div key={row.field} className="p2b-import-row">
                  <dt>{row.field}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  )
}
