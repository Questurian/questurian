import type { Prompt2BlogV3NeedsResearchResponse } from '../../api'
import { PlainResearchFindings } from '../../composer/components/PlainResearchFindings'
import { useClipboardCopy } from '../../composer/hooks/useClipboardCopy'
import { researchNotReadyMessage, researchQuestionLabel } from '../../composer/research-language'

interface NeedsResearchResultProps {
  result: Prompt2BlogV3NeedsResearchResponse
  onBackToResearch: () => void
  onDismiss: () => void
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
        {researchNotReadyMessage(result.unresolved_requirements.length)}
      </p>

      <PlainResearchFindings
        findings={result.findings}
        questions={result.unresolved_requirements}
      />

      {result.unresolved_requirements.length > 0 && (
        <>
          <p className="p2b-import-report-title">Questions still open</p>
          <ul className="p2b-requirement-list">
            {result.unresolved_requirements.map(requirement => (
              <li key={requirement.requirement_id} className="p2b-requirement-row">
                <strong>
                  {researchQuestionLabel(
                    requirement.requirement_id,
                    result.unresolved_requirements
                  )}
                </strong>
                {requirement.gap ? ` — ${requirement.gap}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {(result.unpublished_requirements?.length ?? 0) > 0 && (
        <>
          {/* Shown next to the open questions so the operator does not send the
              follow-up prompt back out looking for a figure that was already
              established as unpublished. */}
          <p className="p2b-import-report-title">Nobody publishes these — already checked</p>
          <ul className="p2b-requirement-list">
            {(result.unpublished_requirements ?? []).map(requirement => (
              <li key={requirement.requirement_id} className="p2b-requirement-row">
                <strong>
                  {researchQuestionLabel(
                    requirement.requirement_id,
                    result.unpublished_requirements ?? []
                  )}
                </strong>
                {requirement.gap ? ` — ${requirement.gap}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.unresolved_conflict_ids.length > 0 && (
        <p className="p2b-field-hint">
          Two sources disagree. The follow-up prompt asks your chatbot to resolve them.
        </p>
      )}

      {result.missing_source_requirements.length > 0 && (
        <p className="p2b-field-hint">
          This kind of article needs a first-hand source. Add genuine matching material — never a
          simulated interview, scene, or quotation.
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
