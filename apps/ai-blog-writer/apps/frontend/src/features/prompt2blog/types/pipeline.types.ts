import type {
  Prompt2BlogArticleFormId,
  Prompt2BlogAudienceTagId,
  Prompt2BlogCommission,
  Prompt2BlogEvidenceRequirementStatus,
  Prompt2BlogSourceRequirement,
  Prompt2BlogTopicModuleId,
} from './editorial.types'

export type Prompt2BlogModelName =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'

// Writing-quality model for the compose / editorial stages, independent of the
// base drafting model. Backend allowlist: app/shared/writer_models.py.
export type Prompt2BlogWriterModel =
  | 'claude-opus-5'
  | 'claude-opus-5-medium'
  | 'claude-opus-5-high'
  | 'claude-opus-5-xhigh'
  | 'claude-opus-5-max'
  | 'claude-opus-4-8'
  | 'claude-opus-4-7'
  | 'claude-sonnet-5'
  | 'claude-sonnet-5-medium'
  | 'claude-sonnet-5-high'
  | 'claude-sonnet-5-xhigh'
  | 'claude-sonnet-5-max'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'

export type Prompt2BlogInputOption = {
  id: string
  label: string
  description?: string
  instructions?: string
  default?: boolean
  order?: number
  paragraph_length?: string
  target_word_count?: number
}

export type Prompt2BlogInputOptionsResponse = {
  tones: Prompt2BlogInputOption[]
  lengths: Prompt2BlogInputOption[]
  brand_voices: Prompt2BlogInputOption[]
  defaults: {
    tone_id: string
    length_id: string
    brand_voice_id: string
  }
}

export const PROMPT2BLOG_PIPELINE_STAGES = [
  'queued',
  'stage_input_validate',
  'stage_input_cleanup',
  'stage_synthesize_sources',
  'stage_guideline_fetch',
  'stage_coverage_check',
  'stage_supplement',
  'stage_outline',
  'stage_compose',
  'stage_groundedness',
  'stage_quality_audit',
  'stage_repair',
  'stage_quality_settle',
  'stage_editorial_augmentation',
  'stage_final_verify',
  'stage_title',
  'stage_finalize',
  'complete',
] as const

/**
 * The v3 graph is shorter than v2 by design: research readiness is settled
 * before a run starts, so there is no guideline fetch, coverage check, or
 * supplement stage to show.
 */
export const PROMPT2BLOG_V3_PIPELINE_STAGES = [
  'queued',
  'stage_v3_outline',
  'stage_v3_compose',
  'stage_v3_groundedness',
  'stage_v3_quality_audit',
  'stage_v3_repair',
  'stage_v3_quality_settle',
  'stage_v3_finalize',
  'complete',
] as const

/**
 * Stage names no run will ever report again, kept only so a stored one still
 * reads.
 *
 * This list is separate from the order above because the order does two jobs
 * that stopped agreeing. `PipelinePanel` renders one row per entry, so a stage
 * left in it shows up as a step of every new run and sits pending forever;
 * `PROMPT2BLOG_KNOWN_PIPELINE_STAGES` matches reported names, so a stage
 * dropped from it makes an old run read as `unknown`. A retired stage needs the
 * second and must not have the first.
 *
 * `stage_v3_title` is here because ADR 0034 deleted the title stage -- the seed
 * is the title -- while runs recorded before that still carry it, which is why
 * the backend also still names it in `WRITING_STAGE_LABELS` and in the debug
 * endpoint's stage list.
 */
export const PROMPT2BLOG_RETIRED_PIPELINE_STAGES = [
  'stage_v3_title',
] as const

export type KnownPrompt2BlogV2PipelineStage = typeof PROMPT2BLOG_PIPELINE_STAGES[number]
export type KnownPrompt2BlogV3PipelineStage =
  | typeof PROMPT2BLOG_V3_PIPELINE_STAGES[number]
  | typeof PROMPT2BLOG_RETIRED_PIPELINE_STAGES[number]

/**
 * Every stage name the status endpoint may legitimately report, across both
 * pipeline versions. Status normalization matches against this so a v3 run
 * does not render as `unknown` while it is working, and so a run stored before
 * a stage was retired still names what it was doing.
 */
export const PROMPT2BLOG_KNOWN_PIPELINE_STAGES = [
  ...PROMPT2BLOG_PIPELINE_STAGES,
  ...PROMPT2BLOG_V3_PIPELINE_STAGES,
  ...PROMPT2BLOG_RETIRED_PIPELINE_STAGES,
] as const

export type KnownPrompt2BlogPipelineStage =
  | KnownPrompt2BlogV2PipelineStage
  | KnownPrompt2BlogV3PipelineStage
export type Prompt2BlogPipelineStage = KnownPrompt2BlogPipelineStage | 'unknown'

/**
 * Why a failed run reports two things.
 *
 * `error` is the backend's sentence, useful in the log and useless to match
 * on. `failure_kind` is the machine half: it says whether the account ran out,
 * whether Claude was never reachable, whether the problem might not repeat, or
 * whether Claude answered with something unusable. The UI reads the kind and
 * writes its own sentence, so "fact-check unavailable" can never again be
 * shown for a run that actually stopped because the account was exhausted.
 */
export type Prompt2BlogFailureKind =
  | 'quota_exhausted'
  | 'not_connected'
  | 'provider_unavailable'
  | 'invalid_response'

export type Prompt2BlogStatusResponse = {
  run_id: string
  feature: string
  state: 'pending' | 'running' | 'completed' | 'failed'
  stage: Prompt2BlogPipelineStage
  raw_stage?: string | null
  error: string | null
  failure_kind?: Prompt2BlogFailureKind | string | null
  updated_at: string
}

/**
 * What resuming one failed run would do, answered before anything is spent.
 *
 * `reason` is the machine half, the same string the backend refuses with. The
 * UI writes its own sentence from it, so a run that cannot be resumed says why
 * rather than just hiding the button.
 */
export type Prompt2BlogResumeReason =
  | 'resumable'
  | 'run_not_found'
  | 'not_prompt2blog'
  | 'run_not_failed'
  | 'no_snapshot'
  | 'snapshot_version_unsupported'
  | 'schema_version_unsupported'
  | 'commission_mismatch'
  | 'snapshot_unreadable'
  | 'run_already_finished'
  | 'resume_limit_reached'

export type Prompt2BlogResumePlan = {
  run_id: string
  resumable: boolean
  reason: Prompt2BlogResumeReason | string
  resume_from_stage: Prompt2BlogPipelineStage | string | null
  failed_stage: Prompt2BlogPipelineStage | string | null
  failure_kind?: Prompt2BlogFailureKind | string | null
  completed_stages: string[]
  tokens_already_spent: number | null
  resume_count: number
  resume_attempts_allowed: number
}

export type Prompt2BlogResumeResponse = Prompt2BlogResumePlan & {
  message: string
  status: 'queued'
}

export type Prompt2BlogStageTrace = {
  stage: string
  model_name?: string
  input?: unknown
  prompt?: string
  raw_response?: string
  parsed?: unknown
  output?: unknown
  skipped?: boolean
  error?: string
}

export type Prompt2BlogGroundedness = {
  checked: boolean
  grounded: boolean
  assessment: string
  unsupported_claims: Array<{
    claim: string
    reason: string
    severity: 'high' | 'low'
  }>
  high_severity_count: number
}

export type Prompt2BlogRunCost = {
  stack_id: string
  // Named from the run's requested routing when it named one, and otherwise
  // from the model the ledger saw answer that stage. A v4 run requests no
  // routing, so before that fallback existed all three of these were null.
  models: {
    worker: string | null
    writer: string | null
    judge: string | null
  }
  input_tokens: number
  output_tokens: number
  // Billed at the output rate, and included in output_tokens.
  reasoning_tokens?: number
  cached_input_tokens: number
  total_tokens: number
  successful_calls: number
  measured_calls: number
  // Calls the provider reported no usage for. A run with any of these has a
  // floor, not a total.
  unmetered_calls?: number
  // The sum of the stage rows. Published so a reader can check the headline
  // total rather than trust it; the two are sums over the same ledger.
  attributed_total_tokens?: number
  ledger_version?: number
  measurement_status: 'complete' | 'partial' | 'unavailable'
  estimated_cost_usd: number | null
  currency: 'USD'
  by_model: Array<{
    model: string
    input_tokens: number
    output_tokens: number
    reasoning_tokens?: number
    cached_input_tokens: number
    total_tokens: number
    calls: number
    estimated_cost_usd: number | null
  }>
  // Sorted by total tokens descending. Absent on runs recorded before
  // per-stage attribution existed.
  by_stage?: Array<{
    stage: string
    input_tokens: number
    output_tokens: number
    reasoning_tokens: number
    cached_input_tokens: number
    total_tokens: number
    calls: number
    // How many times the pipeline entered this stage.
    attempts?: number
  }>
  // One row per numbered attempt of a stage, in the order the run made them.
  // A second fact-check adds a row here; it never replaces the first one's.
  by_attempt?: Array<{
    stage: string
    attempt: number
    input_tokens: number
    output_tokens: number
    reasoning_tokens: number
    cached_input_tokens: number
    total_tokens: number
    calls: number
    cost_usd: number | null
  }>
  pricing_note: string
}

export type Prompt2BlogPipelinePayload = {
  message: string
  run_id: string
  langsmith_trace_url?: string
  langsmith_trace_run_id?: string
  pipeline_status: 'ready_for_staging' | 'needs_revision'
  // Why a run was held back. Empty when the run is ready.
  readiness_blockers?: string[]
  article_type: {
    id: number
    name: string
    definition: string
  }
  guideline_meta: {
    guideline: string
    title_guideline: string
    guideline_file?: string | null
    title_guideline_file?: string | null
  }
  input_profiles?: {
    tone?: Record<string, unknown>
    length?: Record<string, unknown>
    brand_voice?: Record<string, unknown>
    creativity_level?: string
  }
  improved_article: {
    title: string
    content: string
  }
  final_markdown: string
  run_cost?: Prompt2BlogRunCost
  quality_review: {
    alignment_summary: string
    improvements_applied: string[]
    remaining_gaps: string[]
    quality_summary: string
    quality_scores: {
      overall: number
      guideline_coverage: number
      informativeness: number
      originality: number
      brief_adherence: number
      seo: number
    }
    constraint_checks: {
      target_word_count_met: boolean
      paragraph_length_met: boolean
      cta_present: boolean
      primary_keyword_present: boolean
      secondary_keywords_present: boolean
      audience_match: boolean
      tone_match: boolean
      must_include_covered: boolean
      claims_grounded: boolean
    }
    readiness_blockers?: string[]
    groundedness: Prompt2BlogGroundedness
    secondary_keyword_coverage: number
    must_include_coverage: number
    word_count_estimate: number
    repair_applied: boolean
    editorial_augmentation_applied: boolean
    editorial_components_added: Array<{
      component: string
      justification: string
      placement: string
    }>
    editorial_augmentation_summary: string
    editorial_diagnostic: {
      cognitive_load: 'strong' | 'weak'
      narrative_density: 'strong' | 'weak'
      emphasis_clarity: 'strong' | 'weak'
      reading_behavior_risk: 'strong' | 'weak'
    }
    coverage: {
      coverage_sufficient: boolean
      analysis: string
      missing_sections: string[]
    }
    model_used: string
  }
  debug?: {
    pipeline_input: {
      article_type_id: number
      model_name: string
      include_debug: boolean
      enable_editorial_augmentation?: boolean
      raw_sources_count: number
    }
    writing_brief: Record<string, unknown>
    pipeline_trace?: Prompt2BlogStageTrace[]
  }
}

/**
 * The v3 result artifact. It is deliberately not a superset of the v2 payload:
 * v3 has no article type, no guideline meta, no SEO brief, and no editorial
 * augmentation, and it carries the approved commission and the evidence
 * receipt that v2 had no place to put.
 */
/**
 * Why the quality gate stopped repairing. A `needs_revision` article that the
 * auditor failed and one the pipeline refused to keep paying for are the same
 * result without it.
 *
 * Optional: runs stored before the repair budget existed do not carry it.
 */
export type Prompt2BlogRepairDecision = {
  route: 'repair' | 'settle'
  reason:
    | 'draft_passed_audit'
    | 'repairable_problems_found'
    | 'attempt_limit_reached'
    | 'token_budget_reached'
  problems: string[]
  attempts_used: number
  attempts_allowed: number
  /** Null when nothing was counting tokens for this run. */
  tokens_spent: number | null
  tokens_per_attempt: number
  token_budget: number
}

export type Prompt2BlogV3PipelinePayload = {
  message: string
  run_id: string
  schema_version: 3
  status: 'completed'
  langsmith_trace_url?: string
  langsmith_trace_run_id?: string
  pipeline_status: 'ready_for_staging' | 'needs_revision'
  readiness_blockers: string[]
  /** How many times this article had to be picked up after a failed leg. */
  resume_count?: number
  commission: Prompt2BlogCommission
  form: {
    id: Prompt2BlogArticleFormId | null
    label: string | null
  }
  instruction_meta: Prompt2BlogV3InstructionMeta
  evidence_receipt: Prompt2BlogEvidenceReceipt
  improved_article: {
    title: string
    content: string
  }
  final_markdown: string
  run_cost?: Prompt2BlogRunCost
  input_profiles?: {
    tone?: Record<string, unknown>
    length?: Record<string, unknown>
    brand_voice?: Record<string, unknown>
    creativity_level?: string
  }
  quality_review: {
    alignment_summary: string
    improvements_applied: string[]
    remaining_gaps: string[]
    quality_summary: string
    quality_scores: {
      overall: number
      // The v3 name for what v2 called guideline coverage: how faithfully the
      // draft answers the approved commission.
      commission_fidelity: number
      informativeness: number
      originality: number
      brief_adherence: number
      seo: number
    }
    constraint_checks: Record<string, boolean | number>
    readiness_blockers: string[]
    word_count_estimate: number
    /** Optional: runs stored before this field existed do not carry it. */
    word_count_check?: {
      target_word_count_met: boolean
      word_count_estimate: number
      /** Words outside the accepted band: positive over, negative under. */
      word_count_delta: number
      word_count_direction: 'within' | 'over' | 'under'
      word_count_target_min: number
      word_count_target_max: number
    }
    repair_applied: boolean
    repair_attempts: number
    repair_decision?: Prompt2BlogRepairDecision | null
    groundedness: Prompt2BlogGroundedness
    outline_accepted: boolean
    outline_section_count: number
    outline_unsupported_requirements: string[]
    model_used: string
    stage_model_overrides?: Record<string, string>
  }
  debug?: {
    pipeline_input: Record<string, unknown>
    instruction_text: string
    evidence_records: string
    pipeline_trace?: Prompt2BlogStageTrace[]
  }
}

export type Prompt2BlogV3InstructionMeta = {
  schema_version?: number
  form_id?: Prompt2BlogArticleFormId
  form_label?: string
  source_requirements?: string[]
  topic_module_ids?: Prompt2BlogTopicModuleId[]
  audience_tag_ids?: Prompt2BlogAudienceTagId[]
  house_rules_id?: string
  headline_rules_id?: string
  precedence?: string[]
  commission_fingerprint?: string
  evidence_receipt?: Prompt2BlogEvidenceReceipt
}

export type Prompt2BlogEvidenceReceipt = {
  source_ids?: string[]
  claim_ids?: string[]
  requirement_status?: Record<string, Prompt2BlogEvidenceRequirementStatus>
  unresolved_requirement_ids?: string[]
  unpublished_requirement_ids?: string[]
  unresolved_conflict_ids?: string[]
}

export type Prompt2BlogV3ReadinessFindingCode =
  | 'requirement_gap'
  | 'unresolved_conflict'
  | 'source_gate'
  | 'nothing_answered'
  | 'premise_refuted'
  | 'premise_unverified'

export type Prompt2BlogV3ReadinessFinding = {
  code: Prompt2BlogV3ReadinessFindingCode
  requirement_ids: string[]
  message: string
}

/**
 * `needs_research` is a product state, not an error. The run was never queued,
 * no writer-model token was spent, and the payload carries the prompt that
 * closes exactly the gaps the deterministic gate found.
 */
export type Prompt2BlogV3NeedsResearchResponse = {
  message?: string
  status: 'needs_research'
  commission_fingerprint: string
  findings: Prompt2BlogV3ReadinessFinding[]
  unresolved_requirements: Array<{
    requirement_id: string
    question: string
    gap: string
  }>
  unpublished_requirements?: Array<{
    requirement_id: string
    question: string
    gap: string
  }>
  unresolved_conflict_ids: string[]
  missing_source_requirements: Prompt2BlogSourceRequirement[]
  /**
   * Whether more research is the wrong thing to send the operator back to.
   * Only a refuted premise sets this: everything else on this payload is
   * closed by researching again, and that one never is.
   */
  requires_new_direction?: boolean
  refuted_premise?: Prompt2BlogV3PremiseReport[]
  unverified_premise?: Prompt2BlogV3PremiseReport[]
  follow_up_research_prompt: string
}

export type Prompt2BlogV3PremiseReport = {
  assumption_id: string
  statement: string
  basis: string
  requirement_ids: string[]
}

export type Prompt2BlogV3QueuedResponse = {
  message?: string
  status: 'queued'
  run_id: string
}

export type Prompt2BlogV3StartResponse =
  | Prompt2BlogV3QueuedResponse
  | Prompt2BlogV3NeedsResearchResponse

/**
 * A run artifact carries exactly one pipeline payload, under the key naming
 * the version that produced it. Legacy runs keep `pipeline_v2` forever; both
 * keys stay optional so old result pages continue to open.
 */
export type Prompt2BlogRunArtifact = {
  pipeline_v2?: Prompt2BlogPipelinePayload
  pipeline_v3?: Prompt2BlogV3PipelinePayload
  stages?: Record<string, unknown>
}

export type Prompt2BlogResultResponse = {
  run_id: string
  langsmith_trace_url?: string
  langsmith_trace_run_id?: string
  markdown: string
  artifact: Prompt2BlogRunArtifact
}

export type Prompt2BlogDebugResponse = {
  run_id: string
  status: Prompt2BlogStatusResponse
  stages: Record<string, unknown>
  output:
    | {
        markdown: string
        artifact: Prompt2BlogRunArtifact
      }
    | null
}

export type Prompt2BlogDebugStages = Prompt2BlogDebugResponse['stages']
