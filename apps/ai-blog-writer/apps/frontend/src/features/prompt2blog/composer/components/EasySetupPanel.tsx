import { useEffect, useState } from 'react'
import type {
  Prompt2BlogCommissionDraft,
  Prompt2BlogDirectionOptionId,
  Prompt2BlogDirectionResponse,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage,
} from '../../api'
import type { P2BEditorialComposerState, P2BFormState } from '../composer.types'
import type { P2BStep, P2BStepId } from '../step-model'
import { reviewDirectionResponseJson, type DirectionImportReview } from '../direction-import'
import { buildDirectionPrompt } from '../direction-prompt'
import { useClipboardCopy } from '../hooks/useClipboardCopy'
import { ArticleFitGuide } from './ArticleFitGuide'
import { CommissionEditor } from './CommissionEditor'
import { ChatbotRoundTrip } from './ChatbotRoundTrip'
import { DirectionCards } from './DirectionCards'
import { ResearchPanel } from './ResearchPanel'
import { StepSection } from './StepSection'

interface EasySetupPanelProps {
  activeWorkflow: P2BFormState['activeWorkflow']
  editorial: P2BEditorialComposerState
  editorialOptions: Prompt2BlogEditorialOptionsResponse | null
  editorialOptionsError: boolean
  editorialOptionsLoading: boolean
  location: string
  steps: readonly P2BStep[]
  title: string
  onApplyDirectionResponse: (response: Prompt2BlogDirectionResponse) => void
  onApproveCommission: () => Promise<void>
  onClearDirectionWorkflow: () => void
  onClearEvidence: () => void
  onCommissionChange: (draft: Prompt2BlogCommissionDraft) => void
  onConfirmCommissionReview: () => void
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
  location,
  steps,
  title,
  onApplyDirectionResponse,
  onApproveCommission,
  onClearDirectionWorkflow,
  onClearEvidence,
  onCommissionChange,
  onConfirmCommissionReview,
  onLocationChange,
  onRetryEditorialOptions,
  onSelectDirection,
  onStartDirectionWorkflow,
  onStoreEvidence,
  onTitleChange,
}: EasySetupPanelProps) {
  const [prompt, setPrompt] = useState<string | null>(null)
  const directionCopy = useClipboardCopy()
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

  // deriveP2BSteps always returns all five; a missing one means the page handed
  // this panel something other than the step model, which is a programming
  // error rather than a state the operator can reach.
  const awaitingReview =
    editorial.approval.status === 'approved'
    && editorial.reviewedCommissionFingerprint
      !== editorial.approval.commission.commission_fingerprint

  const stepFor = (id: P2BStepId): P2BStep => {
    const step = steps.find(candidate => candidate.id === id)
    if (!step) throw new Error(`Missing step "${id}" in the step model.`)
    return step
  }

  return (
    <>
      <StepSection step={stepFor('start')}>
        <ArticleFitGuide />
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
        <p className="p2b-field-hint">
          Only the working title and location leave the app at this step.
        </p>
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
      </StepSection>

      <StepSection step={stepFor('direction')}>
        <ChatbotRoundTrip />
        {prompt === null && !showDirectionStep && (
          <p className="p2b-field-hint">
            Finish step 1 and your direction prompt appears here.
          </p>
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
          </>
        )}
      </StepSection>

      <StepSection step={stepFor('commission')}>
        {!editorial.commissionDraft && (
          <p className="p2b-field-hint">
            Choose a direction in step 2 and what you commissioned appears here.
          </p>
        )}
        {editorialOptions && editorial.commissionDraft && (
          <>
            {awaitingReview && (
              <div className="p2b-commission-alert" role="status">
                <span>
                  Choosing that direction locked this commission. Research can add facts to
                  it, but nothing after this point can change what the article is. Read it,
                  change anything that is wrong, then confirm.
                </span>
              </div>
            )}
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
            {awaitingReview && (
              <div className="p2b-panel-actions">
                <button
                  type="button"
                  className="p2b-submit-btn"
                  onClick={onConfirmCommissionReview}
                >
                  This is right — go to research
                </button>
              </div>
            )}
          </>
        )}
      </StepSection>

      <StepSection step={stepFor('research')}>
        <ChatbotRoundTrip />
        {editorialOptions && editorial.approval.status === 'approved' ? (
          <ResearchPanel
            commission={editorial.approval.commission}
            editorialOptions={editorialOptions}
            evidencePackage={editorial.evidencePackage}
            onClearEvidence={onClearEvidence}
            onStoreEvidence={onStoreEvidence}
          />
        ) : (
          <p className="p2b-field-hint">
            Confirm the commission in step 3 and its research prompt appears here.
          </p>
        )}
      </StepSection>
    </>
  )
}
