import type { Url2BlogStageTrace } from '../types/pipeline.types'

export type TraceStatus = 'completed' | 'skipped' | 'error'
export type TracePhase = { key: string; title: string; description: string }

function toTitleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function getTraceCallLabel(stage: string): string {
  if (stage.startsWith('length_expansion_pass_')) {
    return `Length expansion pass ${stage.replace('length_expansion_pass_', '')}`
  }

  const labels: Record<string, string> = {
    stage1_extract_article: 'Extract article from URL',
    stage1_cleanup_pasted_text: 'Clean pasted article text',
    stage1_translate_article: 'Translate article to English',
    stage2_classification: 'Classify article type',
    editorial_blueprint: 'Plan editorial blueprint',
    short_article_enrichment: 'Collect grounded context',
    source_facts_extraction: 'Extract source facts',
    guideline_rewrite_initial: 'Initial guideline rewrite',
    quality_audit_initial: 'Initial quality audit',
    rewrite_repair_second_pass: 'Second-pass rewrite repair',
    quality_audit_after_second_pass: 'Quality audit after second pass',
    fact_coverage_audit_initial: 'Initial fact-coverage audit',
    fact_repair: 'Repair missing facts',
    quality_audit_after_fact_repair: 'Quality audit after fact repair',
    fact_coverage_audit_after_fact_repair: 'Fact-coverage audit after repair',
    length_expansion: 'Length expansion gate',
    quality_audit_after_length_expansion: 'Quality audit after length expansion',
    fact_coverage_audit_after_length_expansion: 'Fact-coverage audit after length expansion',
    editorial_augmentation: 'Editorial augmentation',
    editorial_post_recheck: 'Post-editorial recheck',
    editorial_post_recheck_quality_audit: 'Post-editorial quality audit',
    editorial_post_recheck_fact_coverage: 'Post-editorial fact-coverage audit',
    finalize_output: 'Finalize output',
  }
  return labels[stage] ?? toTitleCase(stage)
}

function getTracePhase(stage: string): TracePhase {
  if (stage.startsWith('stage1_')) return { key: 'phase_1_source_extraction', title: 'Phase 1: Source Extraction', description: 'Fetch article text, extract content, and translate if needed.' }
  if (stage === 'stage2_classification') return { key: 'phase_2_classification', title: 'Phase 2: Classification', description: 'Classify the article into the selected content type.' }
  if (stage === 'short_article_enrichment') return { key: 'phase_3_enrichment', title: 'Phase 3: External Enrichment', description: 'Optionally gather grounded context for short source articles.' }
  if (stage === 'source_facts_extraction') return { key: 'phase_4_fact_anchor_extraction', title: 'Phase 4: Fact Anchor Extraction', description: 'Extract key source facts used for retention and audits.' }
  if (stage === 'editorial_blueprint') return { key: 'phase_5_editorial_blueprint', title: 'Phase 5: Editorial Blueprint', description: 'Plan editorial components before drafting the article.' }
  if (stage === 'guideline_rewrite_initial' || stage === 'rewrite_repair_second_pass') return { key: 'phase_6_rewrite', title: 'Phase 6: Guideline Rewrite', description: 'Produce and optionally repair the rewritten draft.' }
  if (stage.startsWith('quality_audit_') || stage === 'quality_audit_initial') return { key: 'phase_7_quality', title: 'Phase 7: Quality Audits', description: 'Evaluate guideline alignment, informativeness, and originality.' }
  if (stage.startsWith('fact_coverage_') || stage === 'fact_repair') return { key: 'phase_8_fact_retention', title: 'Phase 8: Fact Retention', description: 'Audit factual coverage and repair missing high-priority facts.' }
  if (stage.startsWith('length_expansion')) return { key: 'phase_9_length_expansion', title: 'Phase 9: Length Expansion', description: 'Expand article depth to satisfy minimum length targets.' }
  if (stage === 'editorial_augmentation') return { key: 'phase_10_editorial_augmentation', title: 'Phase 10: Editorial Augmentation', description: 'Optionally add editorial components for readability.' }
  if (stage.startsWith('editorial_post_recheck')) return { key: 'phase_11_editorial_recheck', title: 'Phase 11: Editorial Recheck', description: 'Validate post-editorial quality/fact integrity with rollback fallback.' }
  if (stage === 'finalize_output') return { key: 'phase_12_finalize', title: 'Phase 12: Finalization', description: 'Assemble final markdown and response payload.' }
  return { key: 'phase_misc', title: 'Phase: Miscellaneous', description: 'Additional pipeline steps.' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function getTraceStatus(entry: Url2BlogStageTrace): TraceStatus {
  if (entry.error) return 'error'
  if (isRecord(entry.output) && entry.output.skipped === true) return 'skipped'
  return 'completed'
}

export function getTraceStatusLabel(status: TraceStatus): string {
  if (status === 'error') return 'Error'
  if (status === 'skipped') return 'Skipped'
  return 'Completed'
}

export function groupPipelineTrace(trace: Url2BlogStageTrace[]) {
  const phaseOrder: string[] = []
  const phaseMap = new Map<string, {
    phase: TracePhase
    calls: Array<{ entry: Url2BlogStageTrace; index: number; callLabel: string }>
  }>()

  trace.forEach((entry, index) => {
    const phase = getTracePhase(entry.stage)
    const existing = phaseMap.get(phase.key)
    if (existing) {
      existing.calls.push({ entry, index, callLabel: getTraceCallLabel(entry.stage) })
      return
    }
    phaseMap.set(phase.key, { phase, calls: [{ entry, index, callLabel: getTraceCallLabel(entry.stage) }] })
    phaseOrder.push(phase.key)
  })

  return phaseOrder
    .map((key) => phaseMap.get(key))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
}
