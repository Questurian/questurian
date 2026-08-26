import { useEffect, useMemo, useState } from 'react'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage,
} from '../../api'
import {
  evidenceReadinessFindings,
  reviewEvidencePackageJson,
  validateEvidencePackageValue,
  type EvidenceImportReview,
} from '../evidence-import'
import {
  recordWriterAnswer,
  removeWriterAnswer,
  writerAnsweredRequirementIds,
  writerAnswerText,
} from '../writer-answer'
import { buildFollowUpResearchPrompt } from '../follow-up-research-prompt'
import { buildResearchPrompt } from '../research-prompt'
import { useClipboardCopy } from '../hooks/useClipboardCopy'
import {
  plainEvidenceIssue,
  researchNotReadyMessage,
  researchQuestionLabel,
  researchReadyMessage,
  researchStatusLabel,
} from '../research-language'
import { PlainResearchFindings } from './PlainResearchFindings'

interface ResearchPanelProps {
  commission: Prompt2BlogCommission
  editorialOptions: Prompt2BlogEditorialOptionsResponse
  evidencePackage: Prompt2BlogEvidencePackage | null
  onClearEvidence: () => void
  onStoreEvidence: (evidencePackage: Prompt2BlogEvidencePackage) => void
}

export function ResearchPanel({
  commission,
  editorialOptions,
  evidencePackage,
  onClearEvidence,
  onStoreEvidence,
}: ResearchPanelProps) {
  const [evidenceJson, setEvidenceJson] = useState('')
  const [review, setReview] = useState<EvidenceImportReview | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [writerAnswers, setWriterAnswers] = useState<Record<string, string>>({})
  const researchCopy = useClipboardCopy()
  const followUpCopy = useClipboardCopy()
  // The attached package is the one thing on this page a user needs *out* of
  // the app: to keep it, to hand it to someone, or to carry it into a fresh
  // chat. Without this the only copy of it is buried inside the follow-up
  // prompt textarea.
  const evidenceCopy = useClipboardCopy('Copy evidence package')

  const fingerprint = commission.commission_fingerprint

  // A new commission is new research. Nothing typed against the previous one
  // may stay on screen where it could be attached to this one.
  useEffect(() => {
    setEvidenceJson('')
    setReview(null)
    setStatus(null)
    setWriterAnswers({})
  }, [fingerprint])

  const researchPrompt = useMemo(
    () => buildResearchPrompt(commission, editorialOptions),
    [commission, editorialOptions],
  )

  const findings = useMemo(
    () =>
      evidencePackage
        ? evidenceReadinessFindings(evidencePackage, commission, editorialOptions)
        : [],
    [commission, editorialOptions, evidencePackage],
  )

  const followUpPrompt = useMemo(
    () =>
      evidencePackage
        ? buildFollowUpResearchPrompt(commission, evidencePackage, findings, editorialOptions)
        : null,
    [commission, editorialOptions, evidencePackage, findings],
  )

  // A question established as unpublished is not waiting on anyone. Counting it
  // as unanswered would tell the operator to go and find a number that no one
  // has ever published.
  const unansweredQuestionCount =
    evidencePackage?.requirements.filter(
      requirement =>
        requirement.status !== 'supported' && requirement.status !== 'unpublished',
    ).length ?? 0

  const unpublishedQuestionCount =
    evidencePackage?.requirements.filter(requirement => requirement.status === 'unpublished')
      .length ?? 0

  const writerAnswered = useMemo(
    () => new Set(evidencePackage ? writerAnsweredRequirementIds(evidencePackage) : []),
    [evidencePackage],
  )

  const questionText = (requirementId: string) =>
    commission.requirements.find(item => item.requirement_id === requirementId)?.question ??
    requirementId

  /**
   * The writer's own answer is evidence, so it goes through the same validation
   * a pasted package does. A malformed one is refused here rather than stored
   * and rejected later by the run.
   */
  const storeAnswerEdit = (next: Prompt2BlogEvidencePackage) => {
    const checked = validateEvidencePackageValue(next, commission)
    if (!checked.evidencePackage) {
      setStatus('That answer could not be recorded. Nothing was changed.')
      return
    }
    onStoreEvidence(checked.evidencePackage)
  }

  const handleUseWriterAnswer = (requirementId: string) => {
    if (!evidencePackage) return
    const answer = (writerAnswers[requirementId] ?? '').trim()
    if (!answer) return
    storeAnswerEdit(
      recordWriterAnswer(
        evidencePackage,
        requirementId,
        questionText(requirementId),
        answer,
        new Date().toISOString().slice(0, 10),
      ),
    )
    setWriterAnswers(current => ({ ...current, [requirementId]: '' }))
    setStatus('Your answer is attached as first-hand material.')
  }

  const handleRemoveWriterAnswer = (requirementId: string) => {
    if (!evidencePackage) return
    storeAnswerEdit(removeWriterAnswer(evidencePackage, requirementId))
    setStatus('Your answer was removed. That question is open again.')
  }

  const handleEvidenceJsonChange = (value: string) => {
    setEvidenceJson(value)
    setReview(null)
    setStatus(null)
  }

  const handleCheckEvidence = () => {
    setStatus(null)
    setReview(reviewEvidencePackageJson(evidenceJson, commission, editorialOptions))
  }

  const handleAttachEvidence = () => {
    if (!review?.evidencePackage) return
    try {
      onStoreEvidence(review.evidencePackage)
      setReview(null)
      setEvidenceJson('')
      setStatus('Research is attached to the approved commission.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Research could not be attached.')
    }
  }

  const handleRemoveEvidence = () => {
    onClearEvidence()
    setStatus('Research was removed. The approved commission is unchanged.')
  }

  return (
    <>
      <div className="p2b-subsection-heading p2b-subsection-heading--divided">
        <h3>Research the approved commission</h3>
        <p>
          The prompt carries the locked commission. Research may close gaps; it may never change
          the form, subject, or scope.
        </p>
      </div>
      <div className="p2b-field">
        <div className="p2b-field-label-row">
          <label htmlFor="p2b-research-prompt">Research prompt</label>
          <button
            type="button"
            className="p2b-inline-copy-btn"
            onClick={() => researchCopy.copy(researchPrompt)}
          >
            {researchCopy.label}
          </button>
        </div>
        <textarea
          id="p2b-research-prompt"
          className="p2b-textarea"
          rows={16}
          readOnly
          value={researchPrompt}
        />
      </div>
      <div className="p2b-field">
        <label htmlFor="p2b-evidence-json">Evidence JSON</label>
        <textarea
          id="p2b-evidence-json"
          className="p2b-textarea"
          rows={10}
          value={evidenceJson}
          onChange={event => handleEvidenceJsonChange(event.target.value)}
          placeholder="Paste the evidence package the research chatbot returned."
        />
      </div>
      <div className="p2b-panel-actions">
        <button
          type="button"
          className="p2b-copy-json-btn"
          disabled={!evidenceJson.trim()}
          onClick={handleCheckEvidence}
        >
          Check evidence
        </button>
        <button
          type="button"
          className="p2b-submit-btn"
          disabled={!review?.evidencePackage}
          onClick={handleAttachEvidence}
        >
          Attach research
        </button>
        {evidencePackage && (
          <button type="button" className="p2b-clear-btn" onClick={handleRemoveEvidence}>
            Remove research
          </button>
        )}
      </div>
      {status && (
        <p className="p2b-import-applied" role="status">
          {status}
        </p>
      )}
      {review && review.issues.length > 0 && (
        <div className="p2b-import-report p2b-import-report--blocked">
          <p className="p2b-import-report-title">
            Evidence JSON is blocked — nothing was attached.
          </p>
          <ul className="p2b-import-list">
            {review.issues.map(issue => {
              const plainIssue = plainEvidenceIssue(issue.path, issue.message)
              return (
                <li key={`${issue.path}-${issue.message}`}>
                  {plainIssue.label && <code>{plainIssue.label}</code>}{' '}
                  {plainIssue.message}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {evidencePackage && (
        <div className="p2b-import-report">
          <div className="p2b-field-label-row">
            <p className="p2b-import-report-title">
              {evidencePackage.sources?.length ?? 0} sources and{' '}
              {evidencePackage.claims?.length ?? 0} claims are attached to this commission.
            </p>
            <button
              type="button"
              className="p2b-inline-copy-btn"
              onClick={() => evidenceCopy.copy(JSON.stringify(evidencePackage, null, 2))}
            >
              {evidenceCopy.label}
            </button>
          </div>
          <ul className="p2b-requirement-list">
            {evidencePackage.requirements.map(requirement => (
              <li key={requirement.requirement_id} className="p2b-requirement-row">
                <strong>
                  {researchQuestionLabel(requirement.requirement_id, commission.requirements)}
                </strong>{' '}
                {writerAnswered.has(requirement.requirement_id)
                  ? 'Answered by you'
                  : researchStatusLabel(requirement.status)}
                {requirement.gap ? ` — ${requirement.gap}` : ''}
                {writerAnswered.has(requirement.requirement_id) ? (
                  <div className="p2b-writer-answer">
                    <p className="p2b-field-hint">
                      {writerAnswerText(evidencePackage, requirement.requirement_id)}
                    </p>
                    <button
                      type="button"
                      className="p2b-clear-btn"
                      onClick={() => handleRemoveWriterAnswer(requirement.requirement_id)}
                    >
                      Remove my answer
                    </button>
                  </div>
                ) : (
                  requirement.status !== 'supported' && (
                    // Some facts are real and unpublished at the same time. The
                    // person writing the article can often just answer them, and
                    // sending them back to the research desk cannot.
                    <div className="p2b-writer-answer">
                      <label htmlFor={`p2b-writer-answer-${requirement.requirement_id}`}>
                        Can you answer this yourself?
                      </label>
                      <textarea
                        id={`p2b-writer-answer-${requirement.requirement_id}`}
                        className="p2b-textarea"
                        rows={2}
                        value={writerAnswers[requirement.requirement_id] ?? ''}
                        placeholder="What you know first-hand. Plain words, no need to hedge."
                        onChange={event =>
                          setWriterAnswers(current => ({
                            ...current,
                            [requirement.requirement_id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="p2b-submit-btn"
                        disabled={!(writerAnswers[requirement.requirement_id] ?? '').trim()}
                        onClick={() => handleUseWriterAnswer(requirement.requirement_id)}
                      >
                        Use my answer
                      </button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
          {findings.length > 0 ? (
            <>
              <p className="p2b-import-report-title">
                {researchNotReadyMessage(unansweredQuestionCount)}
              </p>
              <PlainResearchFindings findings={findings} questions={commission.requirements} />
            </>
          ) : (
            <p className="p2b-field-hint">{researchReadyMessage(unpublishedQuestionCount)}</p>
          )}
          {followUpPrompt !== null && (
            <div className="p2b-field">
              <div className="p2b-field-label-row">
                <label htmlFor="p2b-follow-up-prompt">Follow-up research prompt</label>
                <button
                  type="button"
                  className="p2b-inline-copy-btn"
                  onClick={() => followUpCopy.copy(followUpPrompt)}
                >
                  {followUpCopy.label}
                </button>
              </div>
              <textarea
                id="p2b-follow-up-prompt"
                className="p2b-textarea"
                rows={10}
                readOnly
                value={followUpPrompt}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
