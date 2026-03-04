import type { DebugResponse } from '../api'
import {
  getStage0Data,
  getStage2Data,
  getStage3Data,
  getStage4Data,
  getStageEditorialAugmentationData,
} from '../services/stage-data.selectors'

type DebugPanelProps = {
  showDebug: boolean
  onToggleDebug: () => void
  debugData?: DebugResponse
}

const BRANCH_DEBUG_STAGES = [
  { key: 'stage_1_quality_gate', label: 'Stage 1 Gate: Transcript Quality' },
  { key: 'stage_1_repair', label: 'Stage 1 Retry: Transcript Repair' },
  { key: 'stage_2_quality_gate', label: 'Stage 2 Gate: Classification Confidence' },
  { key: 'stage_2_retry', label: 'Stage 2 Retry: Re-classification' },
  { key: 'stage_3_guideline', label: 'Stage 3A: Guideline Retrieval' },
  { key: 'stage_3_coverage', label: 'Stage 3B: Coverage Analysis' },
  { key: 'stage_3_supplement', label: 'Stage 3C: Supplement Generation' },
  { key: 'stage_3_quality_gate', label: 'Stage 3 Gate: Article Quality' },
  { key: 'stage_3_improve', label: 'Stage 3 Retry: Article Rewrite' },
  { key: 'stage_seo_brief', label: 'SEO Stage: Brief Generation' },
  { key: 'stage_seo_enrich', label: 'SEO Stage: Article Enrichment' },
  { key: 'stage_seo_quality_gate', label: 'SEO Gate: Quality Evaluation' },
  { key: 'stage_seo_retry', label: 'SEO Retry: Article Enrichment' },
  { key: 'stage_seo_rollback', label: 'SEO Fallback: Restore Pre-SEO Article' },
  { key: 'stage_editorial_gate', label: 'Editorial Gate' },
  { key: 'stage_editorial_skip', label: 'Editorial Skip Decision' },
  { key: 'stage_5_quality_gate', label: 'Stage 5 Gate: Title Quality' },
  { key: 'stage_5_retry', label: 'Stage 5 Retry: Title Regeneration' },
] as const

export function DebugPanel({ showDebug, onToggleDebug, debugData }: DebugPanelProps) {
  const stage0 = getStage0Data(debugData)
  const stage2 = getStage2Data(debugData)
  const stage3 = getStage3Data(debugData)
  const stageEditorial = getStageEditorialAugmentationData(debugData)
  const stage4 = getStage4Data(debugData)
  const stages = debugData?.stages ?? {}

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
            <pre>{JSON.stringify(stages['stage_1'] ?? {}, null, 2)}</pre>
          </div>
          {BRANCH_DEBUG_STAGES.map((stage) => {
            const payload = stages[stage.key]
            if (!payload) {
              return null
            }
            return (
              <div className="stage-box" key={stage.key}>
                <h3>{stage.label}</h3>
                <pre>{JSON.stringify(payload, null, 2)}</pre>
              </div>
            )
          })}
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

          {stageEditorial ? (
            <>
              <div className="stage-box">
                <h3>Stage 4 (Editorial): Augmentation Request</h3>
                <pre>{stageEditorial.debug_prompt ?? 'No prompt captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 4 (Editorial): Augmentation Response</h3>
                <pre>{stageEditorial.debug_raw_response ?? 'No response captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 4 (Editorial): Parsed Result</h3>
                <pre>
                  {JSON.stringify(
                    {
                      augmentation_applied: stageEditorial.augmentation_applied,
                      augmentation_summary: stageEditorial.augmentation_summary,
                      components_added: stageEditorial.components_added ?? [],
                      diagnostic: stageEditorial.diagnostic ?? {},
                      augmented_content_length: stageEditorial.augmented_content?.length ?? 0,
                      error: stageEditorial.error,
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
                <h3>Stage 5: Title Generation Request</h3>
                <pre>{stage4.debug_prompt ?? 'No prompt captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 5: Title Generation Response</h3>
                <pre>{stage4.debug_raw_response ?? 'No response captured'}</pre>
              </div>
              <div className="stage-box">
                <h3>Stage 5: Parsed Result</h3>
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
