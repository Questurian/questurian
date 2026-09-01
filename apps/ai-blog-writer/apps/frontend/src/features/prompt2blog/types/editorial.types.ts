export type Prompt2BlogArticleFormId =
  | 'news-report'
  | 'analysis'
  | 'explainer'
  | 'feature-profile'
  | 'interview-qa'
  | 'opinion-column'
  | 'personal-essay-travelogue'
  | 'destination-guide'
  | 'service-guide'
  | 'itinerary'
  | 'curated-list-best-of'
  | 'comparison'
  | 'review'
  | 'how-to-checklist'
  | 'cost-budget-breakdown'

export type Prompt2BlogTopicModuleId =
  | 'cost-affordability'
  | 'accommodation-neighborhoods'
  | 'food-drink'
  | 'transportation'
  | 'safety'
  | 'visa-entry'
  | 'seasonality-weather'
  | 'adventure-outdoors'
  | 'long-stay-remote-work'
  | 'culture-etiquette'

export type Prompt2BlogAudienceTagId =
  | 'first-time-visitor'
  | 'solo-traveler'
  | 'family'
  | 'remote-worker-relocator'
  | 'accessibility-needs'
  | 'budget-focused'
  | 'premium-focused'

export type Prompt2BlogScopeMode = 'single_subject' | 'head_to_head' | 'ranked_set'

export type Prompt2BlogReferenceRole = 'primary_subject' | 'context_only' | 'comparator'

export type Prompt2BlogEvidenceSourceType =
  | 'official'
  | 'reporting'
  | 'specialist'
  | 'firsthand'
  | 'other'

export type Prompt2BlogEvidenceMaterialType =
  | 'web'
  | 'report'
  | 'transcript'
  | 'interview-responses'
  | 'first-person-notes'
  | 'evaluation-notes'
  | 'other'

export type Prompt2BlogEvidenceConfidence = 'high' | 'medium' | 'low'

/**
 * `unpublished` is the exit the research desk did not have. A question nobody
 * has ever published an answer to could only be reported as `partial`, which
 * blocked the run and sent the operator back to ask again for a fact that does
 * not exist. It is a finding the article can report, not a gap to chase.
 */
export type Prompt2BlogEvidenceRequirementStatus =
  | 'supported'
  | 'partial'
  | 'missing'
  | 'unpublished'

export type Prompt2BlogCreativityLevel = 'low' | 'medium' | 'high'

export type Prompt2BlogSourceRequirement =
  | 'reported-people-scenes-quotations'
  | 'attributable-responses'
  | 'first-person-material'
  | 'documented-evaluation'

export type Prompt2BlogCommissionAudience = {
  primary_reader: string
  tags?: Prompt2BlogAudienceTagId[]
}

export type Prompt2BlogCommissionReference = {
  name: string
  role: Prompt2BlogReferenceRole
}

export type Prompt2BlogCommissionScope = {
  mode: Prompt2BlogScopeMode
  references: Prompt2BlogCommissionReference[]
}

export type Prompt2BlogCommissionRequirement = {
  requirement_id: string
  question: string
  /**
   * Every premise this question stands on. Empty when the question can be
   * researched on its own. A question that names an assumption dies with it,
   * which is what makes the damage of a false premise countable before a run.
   */
  assumption_ids?: string[]
}

/**
 * One fact a direction takes as already true and already published.
 *
 * The direction step cannot browse, so everything it assumes is unverified by
 * construction. Writing the assumption down is what lets a later step refute
 * it. "Where to eat in Lima right now" produced five questions resting on the
 * 2026 Latin America's 50 Best list being out; it is not out until 1 December
 * 2026, and nothing in the pipeline was in a position to notice.
 */
export type Prompt2BlogCommissionAssumption = {
  assumption_id: string
  statement: string
}

export type Prompt2BlogCommission = {
  schema_version?: 3
  commission_fingerprint: string
  original_title: string
  location: string
  approved_direction: string
  form_id: Prompt2BlogArticleFormId
  topic_module_ids?: Prompt2BlogTopicModuleId[]
  audience: Prompt2BlogCommissionAudience
  core_reader_question: string
  reader_outcome: string
  primary_subject: string
  scope: Prompt2BlogCommissionScope
  premise?: Prompt2BlogCommissionAssumption[]
  requirements: Prompt2BlogCommissionRequirement[]
  exclusions?: string[]
  call_to_action?: string | null
}

export const PROMPT2BLOG_DIRECTION_OPTION_IDS = [
  'direction-1',
  'direction-2',
  'direction-3',
] as const

export type Prompt2BlogDirectionOptionId = (typeof PROMPT2BLOG_DIRECTION_OPTION_IDS)[number]

export type Prompt2BlogDirectionOption = {
  option_id: Prompt2BlogDirectionOptionId
  direction: string
  form_id: Prompt2BlogArticleFormId
  topic_module_ids: Prompt2BlogTopicModuleId[]
  audience: Prompt2BlogCommissionAudience
  core_reader_question: string
  reader_outcome: string
  primary_subject: string
  scope: Prompt2BlogCommissionScope
  premise: Prompt2BlogCommissionAssumption[]
  requirements: Prompt2BlogCommissionRequirement[]
  exclusions: string[]
  rationale: string
}

export type Prompt2BlogDirectionResponse = {
  schema_version: 3
  original_title: string
  location: string
  options: [Prompt2BlogDirectionOption, Prompt2BlogDirectionOption, Prompt2BlogDirectionOption]
}

export type Prompt2BlogCommissionDraft = Omit<Prompt2BlogCommission, 'commission_fingerprint'>

export type Prompt2BlogEvidenceSource = {
  source_id: string
  title: string
  publisher?: string | null
  url?: string | null
  published_at?: string | null
  retrieved_at: string
  source_type: Prompt2BlogEvidenceSourceType
  material_type: Prompt2BlogEvidenceMaterialType
  notes: string[]
}

export type Prompt2BlogEvidenceClaim = {
  claim_id: string
  text: string
  source_ids: string[]
  requirement_ids: string[]
  as_of?: string | null
  confidence: Prompt2BlogEvidenceConfidence
}

export type Prompt2BlogEvidenceRequirement = {
  requirement_id: string
  status: Prompt2BlogEvidenceRequirementStatus
  claim_ids?: string[]
  gap?: string
}

export type Prompt2BlogPremiseVerdict = 'confirmed' | 'refuted' | 'unverified'

/**
 * What research found when it checked one thing the direction step assumed.
 *
 * `refuted` is the verdict that had nowhere to live before. A question about a
 * ranking that has not been published is not a question with an unpublished
 * answer — it is a question about something that does not exist, and the two
 * need different words because they need different next steps.
 */
export type Prompt2BlogEvidencePremiseFinding = {
  assumption_id: string
  verdict: Prompt2BlogPremiseVerdict
  basis: string
  claim_ids?: string[]
}

export type Prompt2BlogEvidenceConflict = {
  conflict_id: string
  claim_ids: string[]
  summary: string
  resolution?: string | null
}

export type Prompt2BlogEvidenceGap = {
  gap_id: string
  requirement_ids: string[]
  summary: string
}

export type Prompt2BlogEvidencePackage = {
  schema_version?: 3
  commission_fingerprint: string
  sources?: Prompt2BlogEvidenceSource[]
  claims?: Prompt2BlogEvidenceClaim[]
  requirements: Prompt2BlogEvidenceRequirement[]
  premise_findings?: Prompt2BlogEvidencePremiseFinding[]
  conflicts?: Prompt2BlogEvidenceConflict[]
  gaps?: Prompt2BlogEvidenceGap[]
}

export type Prompt2BlogWritingProfiles = {
  tone_id: string
  length_id: string
  brand_voice_id?: string | null
  creativity_level?: Prompt2BlogCreativityLevel
}

export type Prompt2BlogModelRouting = {
  model_name?: string | null
  writing_model?: string | null
  repair_model?: string | null
  audit_model?: string | null
  outline_model?: string | null
  groundedness_model?: string | null
  model_stack_id?: string | null
}

export type Prompt2BlogV3Request = {
  schema_version?: 3
  commission: Prompt2BlogCommission
  evidence_package: Prompt2BlogEvidencePackage
  profiles: Prompt2BlogWritingProfiles
  model_routing?: Prompt2BlogModelRouting
  include_debug?: boolean
  enable_editorial_augmentation?: boolean
}

export type Prompt2BlogEditorialFormOption = {
  id: Prompt2BlogArticleFormId
  label: string
  description: string
  order: number
  source_requirements: Prompt2BlogSourceRequirement[]
  /**
   * The form's own "when to pick me" and "when not to" prose.
   *
   * The direction step chose a form from `description` alone — one summary
   * line each — and "Where to eat in Lima right now" became a News Report,
   * because "reports a timely development" is a fair reading of "right now".
   * News Report's own "do not use for broad destination summaries" was in the
   * catalog the whole time and never reached the chooser.
   */
  use_when: string
  do_not_use_when: string
}

export type Prompt2BlogTopicModuleOption = {
  id: Prompt2BlogTopicModuleId
  label: string
  description: string
  order: number
}

export type Prompt2BlogAudienceTagOption = {
  id: Prompt2BlogAudienceTagId
  label: string
  description: string
}

export type Prompt2BlogScopeModeOption = {
  id: Prompt2BlogScopeMode
  label: string
  description: string
}

export type Prompt2BlogReferenceRoleOption = {
  id: Prompt2BlogReferenceRole
  label: string
  description: string
}

export type Prompt2BlogEditorialOptionsResponse = {
  schema_version: 3
  forms: Prompt2BlogEditorialFormOption[]
  topic_modules: Prompt2BlogTopicModuleOption[]
  audience_tags: Prompt2BlogAudienceTagOption[]
  scope_modes: Prompt2BlogScopeModeOption[]
  reference_roles: Prompt2BlogReferenceRoleOption[]
}
