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

export type Prompt2BlogReferenceRole =
  | 'primary_subject'
  | 'context_only'
  | 'comparator'

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

export type Prompt2BlogEvidenceRequirementStatus = 'supported' | 'partial' | 'missing'

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
  requirements: Prompt2BlogCommissionRequirement[]
  exclusions?: string[]
  call_to_action?: string | null
}

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
  audit_model?: string | null
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
