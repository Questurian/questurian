import type { Prompt2BlogV3NeedsResearchResponse } from '../../api'
import { PlainResearchFindings } from './PlainResearchFindings'
import { researchNotReadyMessage, researchQuestionLabel } from '../research-language'

interface NeedsResearchResultProps {
  result: Prompt2BlogV3NeedsResearchResponse
  onBackToResearch: () => void
  onBackToDirection?: () => void
  onDismiss: () => void
}

/**
 * The terminal result of a run that never started.
 *
 * Insufficient research is a product state, not a failure: the commission was
 * valid, the deterministic gate ran before any writing work existed, and no
 * writer-model token was spent. What it produces is a list of exactly what is
 * missing and the route that closes it — never a retry of the same run.
 *
 * There are two such routes, and telling them apart is the whole job of this
 * screen. Almost everything here is closed by researching again. A refuted
 * premise never is: the article was commissioned about something that is not
 * so, and the only move is a different direction.
 */
export function NeedsResearchResult({
  result,
  onBackToResearch,
  onBackToDirection,
  onDismiss,
}: NeedsResearchResultProps) {
  const refutedPremise = result.refuted_premise ?? []
  /*
   * A refuted premise is the one blocker research cannot clear. Offering the
   * follow-up prompt here is what made the original dead end feel like a loop:
   * research, get the same refutation, research again. The page has to say so
   * and point at the only door that opens.
   */
  const needsNewDirection = result.requires_new_direction === true

  return (
    <div className="p2b-import-report p2b-import-report--blocked" role="status">
      <p className="p2b-import-report-title">
        {researchNotReadyMessage(result.unresolved_requirements.length)}
      </p>

      {refutedPremise.length > 0 && (
        <>
          <p className="p2b-import-report-title">
            {refutedPremise.length === 1
              ? 'This article is built on something that is not true'
              : 'This article is built on things that are not true'}
          </p>
          <ul className="p2b-requirement-list">
            {refutedPremise.map(assumption => (
              <li key={assumption.assumption_id} className="p2b-requirement-row">
                <strong>{assumption.statement}</strong>
                {assumption.basis ? ` — ${assumption.basis}` : ''}
                {assumption.requirement_ids.length > 0
                  ? ` This is what ${
                      assumption.requirement_ids.length === 1
                        ? '1 question'
                        : `${assumption.requirement_ids.length} questions`
                    } rested on.`
                  : ''}
              </li>
            ))}
          </ul>
          <p className="p2b-field-hint">
            More research will not change this. Pick a different direction, or start again with
            one that does not depend on it.
          </p>
        </>
      )}

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
          {/* Shown next to the open questions so nobody sends research back out
              looking for a figure already established as unpublished. */}
          <p className="p2b-import-report-title">
            No published answer exists — already checked
          </p>
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

      {(result.unverified_premise?.length ?? 0) > 0 && (
        <>
          <p className="p2b-import-report-title">Could not be checked either way</p>
          <ul className="p2b-requirement-list">
            {(result.unverified_premise ?? []).map(assumption => (
              <li key={assumption.assumption_id} className="p2b-requirement-row">
                <strong>{assumption.statement}</strong>
                {assumption.basis ? ` — ${assumption.basis}` : ''}
              </li>
            ))}
          </ul>
          <p className="p2b-field-hint">
            The next research pass makes one more attempt at these.
          </p>
        </>
      )}

      {result.unresolved_conflict_ids.length > 0 && (
        <p className="p2b-field-hint">
          Two sources disagree. The next research pass is asked to resolve them.
        </p>
      )}

      {result.missing_source_requirements.length > 0 && (
        <p className="p2b-field-hint">
          This kind of article needs a first-hand source. Add genuine matching material — never a
          simulated interview, scene, or quotation.
        </p>
      )}

      {!needsNewDirection && (
        <div className="p2b-field">
          <label htmlFor="p2b-needs-research-prompt">Still to find out</label>
          <textarea
            id="p2b-needs-research-prompt"
            className="p2b-textarea"
            rows={10}
            readOnly
            value={result.follow_up_research_prompt}
          />
        </div>
      )}

      <div className="p2b-panel-actions">
        {needsNewDirection && onBackToDirection ? (
          <button type="button" className="p2b-submit-btn" onClick={onBackToDirection}>
            Choose a different direction
          </button>
        ) : (
          <button type="button" className="p2b-submit-btn" onClick={onBackToResearch}>
            Back to research
          </button>
        )}
        <button type="button" className="p2b-clear-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
