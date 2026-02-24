import type { DebugResponse } from '../api'
import { getStage0Data, getStage2Data, getStage3Data, getStage4Data } from '../services/stage-data.selectors'

type DebugPanelProps = {
  showDebug: boolean
  onToggleDebug: () => void
  debugData?: DebugResponse
}

export function DebugPanel({ showDebug, onToggleDebug, debugData }: DebugPanelProps) {
  const stage0 = getStage0Data(debugData)
  const stage2 = getStage2Data(debugData)
  const stage3 = getStage3Data(debugData)
  const stage4 = getStage4Data(debugData)

  return (
    <section className="panel debug">
      <div className="panel-header">
        <h2>Debug View</h2>
        <button type="button" className="toggle-btn" onClick={onToggleDebug}>
          {showDebug ? 'Hide' : 'Show'} Stage Data
        </button>
      </div>
      {showDebug && debugData ? (
        <div className="panel-body debug-content">
          <div className="stage-box">
            <h3>Stage 0: Raw Input</h3>
            <pre>{JSON.stringify(stage0, null, 2)}</pre>
          </div>
          <div className="stage-box">
            <h3>Stage 1: Transcript cleaned</h3>
            <pre>{JSON.stringify(debugData.stages?.['stage_1'] ?? {}, null, 2)}</pre>
          </div>
          <div className="stage-box">
            <h3>Stage 2: Request to Vertex AI</h3>
            <pre>{stage2?.debug_prompt ?? 'No prompt captured'}</pre>
          </div>
          <div className="stage-box">
            <h3>Stage 2: Raw Response from Vertex AI</h3>
            <pre>{stage2?.debug_raw_response ?? 'No response captured'}</pre>
          </div>
          <div className="stage-box">
            <h3>Stage 2: Parsed Result</h3>
            <pre>
              {JSON.stringify(
                {
                  classification: stage2?.classification,
                  confidence: stage2?.confidence,
                  reasoning: stage2?.reasoning,
                },
                null,
                2
              )}
            </pre>
          </div>

          {stage3 ? (
            <>
              <div className="stage-box">
                <h3>Stage 3: Coverage Analysis Request</h3>
                <pre>{stage3.debug_coverage_prompt ?? 'No prompt captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 3: Coverage Analysis Response</h3>
                <pre>{stage3.debug_coverage_response ?? 'No response captured'}</pre>
              </div>
              {stage3.debug_supplement_prompt ? (
                <>
                  <div className="stage-box">
                    <h3>Stage 3: Supplement Generation Request</h3>
                    <pre>{stage3.debug_supplement_prompt}</pre>
                  </div>
                  <div className="stage-box">
                    <h3>Stage 3: Supplement Generation Response</h3>
                    <pre>{stage3.debug_supplement_response ?? 'No response captured'}</pre>
                  </div>
                </>
              ) : null}
              <div className="stage-box">
                <h3>Stage 3: Article Composition Request</h3>
                <pre>{stage3.debug_composition_prompt ?? 'No prompt captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 3: Article Composition Response</h3>
                <pre>{stage3.debug_composition_response ?? 'No response captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 3: Parsed Result</h3>
                <pre>
                  {JSON.stringify(
                    {
                      article_type: stage3.article_type,
                      coverage_sufficient: stage3.coverage_sufficient,
                      coverage_analysis: stage3.coverage_analysis,
                      missing_sections: stage3.missing_sections,
                      supplemental_content_length: stage3.supplemental_content?.length ?? 0,
                      final_article_length: stage3.final_article?.length ?? 0,
                      guideline_used_length: stage3.guideline_used?.length ?? 0,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </>
          ) : null}

          {stage4 ? (
            <>
              <div className="stage-box">
                <h3>Stage 4: Title Generation Request</h3>
                <pre>{stage4.debug_prompt ?? 'No prompt captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 4: Title Generation Response</h3>
                <pre>{stage4.debug_raw_response ?? 'No response captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 4: Parsed Result</h3>
                <pre>
                  {JSON.stringify(
                    {
                      title: stage4.title,
                      article_type: stage4.article_type,
                      title_guideline_used_length: stage4.title_guideline_used?.length ?? 0,
                      content_length: stage4.content?.length ?? 0,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </>
          ) : null}
        </div>
      ) : showDebug ? (
        <div className="panel-body">
          <p>Loading debug data...</p>
        </div>
      ) : null}
    </section>
  )
}
