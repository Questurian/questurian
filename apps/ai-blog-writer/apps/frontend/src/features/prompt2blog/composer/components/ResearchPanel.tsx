import { useEffect, useMemo, useState } from 'react'
import type {
  Prompt2BlogCommission,
  Prompt2BlogEditorialOptionsResponse,
  Prompt2BlogEvidencePackage,
} from '../../api'
import {
  evidenceReadinessFindings,
  reviewEvidencePackageJson,
  type EvidenceImportReview,
} from '../evidence-import'
import { buildFollowUpResearchPrompt } from '../follow-up-research-prompt'
import { buildResearchPrompt } from '../research-prompt'
import { useClipboardCopy } from '../hooks/useClipboardCopy'

interface ResearchPanelProps {
  commission: Prompt2BlogCommission
  editorialOptions: Prompt2BlogEditorialOptionsResponse
  evidencePackage: Prompt2BlogEvidencePackage | null
  onClearEvidence: () => void
  onStoreEvidence: (evidencePackage: Prompt2BlogEvidencePackage) => void
}

const STATUS_LABELS: Record<string, string> = {
  supported: 'Supported',
  partial: 'Partial',
  missing: 'Missing',
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
            {review.issues.map(issue => (
              <li key={`${issue.path}-${issue.message}`}>
                <code>{issue.path}</code> {issue.message}
              </li>
            ))}
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
                <code>{requirement.requirement_id}</code>{' '}
                {STATUS_LABELS[requirement.status] ?? requirement.status}
                {requirement.gap ? ` — ${requirement.gap}` : ''}
              </li>
            ))}
          </ul>
          {findings.length > 0 ? (
            <>
              <p className="p2b-import-report-title">
                {findings.length} readiness {findings.length === 1 ? 'gap' : 'gaps'} remain. The
                run stays blocked until research closes them.
              </p>
              <ul className="p2b-import-list">
                {findings.map(finding => (
                  <li key={`${finding.code}-${finding.message}`}>
                    <code>{finding.code}</code> {finding.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="p2b-field-hint">
              Every locked requirement is supported and no conflict or source gate is open.
            </p>
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
