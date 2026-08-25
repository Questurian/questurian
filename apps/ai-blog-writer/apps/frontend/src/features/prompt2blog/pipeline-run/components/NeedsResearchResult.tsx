import type { Prompt2BlogV3NeedsResearchResponse } from '../../api'
import { useClipboardCopy } from '../../composer/hooks/useClipboardCopy'

interface NeedsResearchResultProps {
  result: Prompt2BlogV3NeedsResearchResponse
  onBackToResearch: () => void
  onDismiss: () => void
}

const FINDING_LABELS: Record<string, string> = {
  requirement_gap: 'Requirement gap',
  unresolved_conflict: 'Unresolved conflict',
  source_gate: 'Source gate',
}

/**
 * The terminal result of a run that never started.
 *
 * Insufficient research is a product state, not a failure: the commission was
 * valid, the deterministic gate ran before any writing work existed, and no
 * writer-model token was spent. What it produces is a list of exactly what is
 * missing and the prompt that closes it, so the route out of here is more
 * research — never a retry of the same run.
 */
export function NeedsResearchResult({
  result,
  onBackToResearch,
  onDismiss,
}: NeedsResearchResultProps) {
  const followUpCopy = useClipboardCopy()

  return (
    <div className="p2b-import-report p2b-import-report--blocked" role="status">
      <p className="p2b-import-report-title">
        The run did not start: this commission’s research is incomplete. Nothing was queued and
        no article was written.
      </p>

      <ul className="p2b-import-list">
        {result.findings.map(finding => (
          <li key={`${finding.code}-${finding.message}`}>
            <code>{FINDING_LABELS[finding.code] ?? finding.code}</code> {finding.message}
            {finding.requirement_ids.length > 0 && ` (${finding.requirement_ids.join(', ')})`}
          </li>
        ))}
      </ul>

      {result.unresolved_requirements.length > 0 && (
        <>
          <p className="p2b-import-report-title">Requirements still open</p>
          <ul className="p2b-requirement-list">
            {result.unresolved_requirements.map(requirement => (
              <li key={requirement.requirement_id} className="p2b-requirement-row">
                <code>{requirement.requirement_id}</code> {requirement.question}
                {requirement.gap ? ` — ${requirement.gap}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.unresolved_conflict_ids.length > 0 && (
        <p className="p2b-field-hint">
          Unresolved conflicts: {result.unresolved_conflict_ids.join(', ')}
        </p>
      )}

      {result.missing_source_requirements.length > 0 && (
        <p className="p2b-field-hint">
          This article form still needs {result.missing_source_requirements.join(', ')}. Meet it
          with genuine matching material — never a simulated interview, scene, or quotation.
        </p>
      )}

      <div className="p2b-field">
        <div className="p2b-field-label-row">
          <label htmlFor="p2b-needs-research-prompt">Follow-up research prompt</label>
          <button
            type="button"
            className="p2b-inline-copy-btn"
            onClick={() => followUpCopy.copy(result.follow_up_research_prompt)}
          >
            {followUpCopy.label}
          </button>
        </div>
        <textarea
          id="p2b-needs-research-prompt"
          className="p2b-textarea"
          rows={10}
          readOnly
          value={result.follow_up_research_prompt}
        />
      </div>

      <div className="p2b-panel-actions">
        <button type="button" className="p2b-submit-btn" onClick={onBackToResearch}>
          Back to research
        </button>
        <button type="button" className="p2b-clear-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
