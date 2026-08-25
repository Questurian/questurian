import { useEffect, useState } from 'react'
import type {
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOptionId,
  Prompt2BlogDirectionResponse,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage,
  Prompt2BlogInputOptionsResponse,
} from '../../api'
import type { P2BEditorialComposerState, P2BFormState } from '../composer.types'
import { reviewDirectionResponseJson, type DirectionImportReview } from '../direction-import'
import { buildDirectionPrompt } from '../direction-prompt'
import { reviewEasySetupJson, type EasySetupImportReview } from '../easy-setup-import'
import { useClipboardCopy } from '../hooks/useClipboardCopy'
import { CommissionEditor } from './CommissionEditor'
import { DirectionCards } from './DirectionCards'
import { ResearchPanel } from './ResearchPanel'

interface EasySetupPanelProps {
  activeWorkflow: P2BFormState['activeWorkflow']
  editorial: P2BEditorialComposerState
  editorialOptions: Prompt2BlogEditorialOptionsResponse | null
  editorialOptionsError: boolean
  editorialOptionsLoading: boolean
  inputOptions: Prompt2BlogInputOptionsResponse | null
  location: string
  title: string
  onApply: (patch: Partial<P2BFormState>) => void
  onApplyDirectionResponse: (response: Prompt2BlogDirectionResponse) => void
  onApproveCommission: () => Promise<void>
  onClearDirectionWorkflow: () => void
  onClearEvidence: () => void
  onCommissionChange: (draft: Prompt2BlogCommissionDraft) => void
  onLocationChange: (value: string) => void
  onRetryEditorialOptions: () => void
  onSelectDirection: (optionId: Prompt2BlogDirectionOptionId) => Promise<void>
  onStartDirectionWorkflow: () => void
  onStoreEvidence: (evidencePackage: Prompt2BlogEvidencePackage) => void
  onTitleChange: (value: string) => void
}

export function EasySetupPanel({
  activeWorkflow,
  editorial,
  editorialOptions,
  editorialOptionsError,
  editorialOptionsLoading,
  inputOptions,
  location,
  title,
  onApply,
  onApplyDirectionResponse,
  onApproveCommission,
  onClearDirectionWorkflow,
  onClearEvidence,
  onCommissionChange,
  onLocationChange,
  onRetryEditorialOptions,
  onSelectDirection,
  onStartDirectionWorkflow,
  onStoreEvidence,
  onTitleChange,
}: EasySetupPanelProps) {
  const [prompt, setPrompt] = useState<string | null>(null)
  const directionCopy = useClipboardCopy()
  const [pastedJson, setPastedJson] = useState('')
  const [review, setReview] = useState<EasySetupImportReview | null>(null)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const [directionJson, setDirectionJson] = useState('')
  const [directionReview, setDirectionReview] = useState<DirectionImportReview | null>(null)
  const [directionStatus, setDirectionStatus] = useState<string | null>(null)
  // The prompt lists the option catalogs verbatim, so a prompt built before
  // they arrived is missing the fields it should have constrained.
  const showDirectionStep = prompt !== null || activeWorkflow === 'editorial_v3'

  // The hook object is new on every render; only its stable reset belongs in
  // the dependency list, or this would wipe the prompt on every keystroke.
  const resetDirectionCopy = directionCopy.reset

  useEffect(() => {
    setPrompt(null)
    resetDirectionCopy()
    setDirectionJson('')
    setDirectionReview(null)
    setDirectionStatus(null)
  }, [location, resetDirectionCopy, title])

  const handleConfirmSetup = () => {
    const confirmedTitle = title.trim()
    const confirmedLocation = location.trim()
    if (!confirmedTitle || !confirmedLocation) return
    if (!editorialOptions) return
    onStartDirectionWorkflow()
    setPrompt(buildDirectionPrompt(confirmedTitle, confirmedLocation, editorialOptions))
    directionCopy.reset()
  }

  const handleDirectionJsonChange = (value: string) => {
    setDirectionJson(value)
    setDirectionReview(null)
    setDirectionStatus(null)
  }

  const handleCheckDirectionJson = () => {
    if (!editorialOptions) return
    setDirectionStatus(null)
    setDirectionReview(
      reviewDirectionResponseJson(
        directionJson,
        { originalTitle: title.trim(), location: location.trim() },
        editorialOptions,
      ),
    )
  }

  const handleApplyDirectionJson = () => {
    if (!directionReview?.response) return
    onApplyDirectionResponse(directionReview.response)
    setDirectionReview(null)
    setDirectionStatus('Three directions are ready for approval.')
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
          <p>Compare three editorial directions, then approve the commission.</p>
        </div>
      </div>
      <div className="p2b-panel-body">
        <div className="p2b-subsection-heading">
          <h3>Generate a direction prompt</h3>
          <p>Only the working title and location leave the app at this step.</p>
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
            disabled={!title.trim() || !location.trim() || !editorialOptions}
            onClick={handleConfirmSetup}
          >
            Generate direction prompt
          </button>
        </div>
        {editorialOptionsLoading && (
          <p className="p2b-field-hint">Editorial forms and topic modules are still loading.</p>
        )}
        {editorialOptionsError && (
          <div className="p2b-commission-alert p2b-commission-alert--error" role="alert">
            <span>Editorial forms and topic modules could not be loaded.</span>
            <button type="button" className="p2b-clear-btn" onClick={onRetryEditorialOptions}>
              Retry
            </button>
          </div>
        )}
        {prompt !== null && (
          <div className="p2b-field">
            <div className="p2b-field-label-row">
              <label htmlFor="p2b-easy-setup-prompt">Prompt</label>
              <button
                type="button"
                className="p2b-inline-copy-btn"
                onClick={() => directionCopy.copy(prompt)}
              >
                {directionCopy.label}
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
        {showDirectionStep && (
          <>
            <div className="p2b-subsection-heading p2b-subsection-heading--divided">
              <h3>Import three directions</h3>
              <p>Strict validation rejects unknown IDs, extra keys, and comparison drift.</p>
            </div>
            <div className="p2b-field">
              <label htmlFor="p2b-direction-json">Direction JSON</label>
              <textarea
                id="p2b-direction-json"
                className="p2b-textarea"
                rows={10}
                value={directionJson}
                onChange={event => handleDirectionJsonChange(event.target.value)}
                placeholder="Paste the three-option JSON response."
              />
            </div>
            <div className="p2b-panel-actions">
              <button
                type="button"
                className="p2b-copy-json-btn"
                disabled={!directionJson.trim() || !editorialOptions}
                onClick={handleCheckDirectionJson}
              >
                Check directions
              </button>
              <button
                type="button"
                className="p2b-submit-btn"
                disabled={!directionReview?.response}
                onClick={handleApplyDirectionJson}
              >
                Show direction cards
              </button>
              {activeWorkflow === 'editorial_v3' && (
                <button type="button" className="p2b-clear-btn" onClick={onClearDirectionWorkflow}>
                  Clear direction work
                </button>
              )}
            </div>
            {directionStatus && (
              <p className="p2b-import-applied" role="status">
                {directionStatus}
              </p>
            )}
            {directionReview && directionReview.issues.length > 0 && (
              <div className="p2b-import-report p2b-import-report--blocked">
                <p className="p2b-import-report-title">
                  Direction JSON is blocked — nothing was imported.
                </p>
                <ul className="p2b-import-list">
                  {directionReview.issues.map(issue => (
                    <li key={`${issue.path}-${issue.message}`}>
                      <code>{issue.path}</code> {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {editorialOptions && editorial.directionOptions.length > 0 && (
              <DirectionCards
                editorialOptions={editorialOptions}
                options={editorial.directionOptions}
                selectedOptionId={editorial.selectedOptionId}
                onSelect={option => {
                  void onSelectDirection(option.option_id).catch(error =>
                    setDirectionStatus(error instanceof Error ? error.message : 'Approval failed.'),
                  )
                }}
              />
            )}
            {editorialOptions && editorial.commissionDraft && (
              <CommissionEditor
                draft={editorial.commissionDraft}
                editorialOptions={editorialOptions}
                isApproved={editorial.approval.status === 'approved'}
                onApprove={() => {
                  void onApproveCommission().catch(error =>
                    setDirectionStatus(error instanceof Error ? error.message : 'Approval failed.'),
                  )
                }}
                onChange={onCommissionChange}
              />
            )}
            {editorialOptions && editorial.approval.status === 'approved' && (
              <ResearchPanel
                commission={editorial.approval.commission}
                editorialOptions={editorialOptions}
                evidencePackage={editorial.evidencePackage}
                onClearEvidence={onClearEvidence}
                onStoreEvidence={onStoreEvidence}
              />
            )}
          </>
        )}
        <details className="p2b-disclosure">
          <summary>Legacy v2 brief import</summary>
          <div className="p2b-disclosure-body">
            <p className="p2b-field-hint">
              Temporary compatibility path for saved one-shot briefs.
            </p>
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
                  {review.issues.length} problem
                  {review.issues.length === 1 ? '' : 's'} — nothing was applied.
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
        </details>
      </div>
    </section>
  )
}
