import {
  DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  resolvePrompt2BlogModelStack,
  resolvePrompt2BlogModelName,
  resolvePrompt2BlogWriterModel,
} from '../constants/prompt2blog.constants'
import type {
  P2BCommissionApproval,
  P2BEditorialComposerState,
  P2BFormState,
} from './composer.types'
import {
  PROMPT2BLOG_DIRECTION_OPTION_IDS,
  type Prompt2BlogCommission,
  type Prompt2BlogCommissionDraft,
  type Prompt2BlogDirectionOption,
  type Prompt2BlogDirectionOptionId,
} from '../api'
import { commissionMatchesDraft, fingerprintCommissionSync } from './commission'
import { retainedEvidencePackage } from './commission-state'
import { validateEvidencePackageValue } from './evidence-import'

export const COMPOSER_STORAGE_KEY = 'p2b-form-draft'
export const COMPOSER_STORAGE_VERSION = 3
const DEFAULT_MODEL_STACK = resolvePrompt2BlogModelStack(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)
const ARTICLE_FORM_IDS = new Set([
  'news-report',
  'analysis',
  'explainer',
  'feature-profile',
  'interview-qa',
  'opinion-column',
  'personal-essay-travelogue',
  'destination-guide',
  'service-guide',
  'itinerary',
  'curated-list-best-of',
  'comparison',
  'review',
  'how-to-checklist',
  'cost-budget-breakdown',
])
const TOPIC_MODULE_IDS = new Set([
  'cost-affordability',
  'accommodation-neighborhoods',
  'food-drink',
  'transportation',
  'safety',
  'visa-entry',
  'seasonality-weather',
  'adventure-outdoors',
  'long-stay-remote-work',
  'culture-etiquette',
])
const AUDIENCE_TAG_IDS = new Set([
  'first-time-visitor',
  'solo-traveler',
  'family',
  'remote-worker-relocator',
  'accessibility-needs',
  'budget-focused',
  'premium-focused',
])
const COMMISSION_DRAFT_KEYS = [
  'schema_version',
  'original_title',
  'location',
  'approved_direction',
  'form_id',
  'topic_module_ids',
  'audience',
  'core_reader_question',
  'reader_outcome',
  'primary_subject',
  'scope',
  'requirements',
  'exclusions',
  'call_to_action',
] as const
const DIRECTION_OPTION_KEYS = [
  'option_id',
  'direction',
  'form_id',
  'topic_module_ids',
  'audience',
  'core_reader_question',
  'reader_outcome',
  'primary_subject',
  'scope',
  'requirements',
  'exclusions',
  'rationale',
] as const

export const DEFAULT_EDITORIAL_STATE: P2BEditorialComposerState = {
  directionOptions: [],
  selectedOptionId: null,
  commissionDraft: null,
  approval: { status: 'not_started' },
  evidencePackage: null,
}

export const DEFAULT_COMPOSER_STATE: P2BFormState = {
  activeWorkflow: 'legacy_v2',
  editorial: DEFAULT_EDITORIAL_STATE,
  easySetupLocation: '',
  easySetupTitle: '',
  articleTypeId: null,
  articleGoal: '',
  targetReader: '',
  destinationContext: '',
  angle: '',
  callToAction: '',
  modelStackId: DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  modelName: DEFAULT_MODEL_STACK.modelName,
  writingModel: DEFAULT_MODEL_STACK.writingModel,
  auditModel: DEFAULT_MODEL_STACK.auditModel,
  toneId: '',
  lengthId: '',
  brandVoiceId: '',
  primaryKeyword: '',
  secondaryKeywords: '',
  mustInclude: '',
  creativityLevel: 'medium',
  negativeInstructions: '',
  enableEditorialAugmentation: false,
  blobs: [{ id: 1, content: '' }],
}

function hasMeaningfulLegacyEditorialState(parsed: Partial<P2BFormState>): boolean {
  return Boolean(
    parsed.articleTypeId ||
    parsed.easySetupTitle?.trim() ||
    parsed.easySetupLocation?.trim() ||
    parsed.articleGoal?.trim() ||
    parsed.targetReader?.trim() ||
    parsed.destinationContext?.trim() ||
    parsed.angle?.trim() ||
    parsed.callToAction?.trim(),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim())
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every(key => allowed.has(key))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function hasUniqueValues(values: string[]): boolean {
  return new Set(values.map(value => value.trim().toLocaleLowerCase())).size === values.length
}

function isCommissionDraft(
  value: unknown,
  allowFingerprint = false,
): value is Prompt2BlogCommissionDraft {
  if (!isRecord(value)) return false
  const allowedKeys = allowFingerprint
    ? [...COMMISSION_DRAFT_KEYS, 'commission_fingerprint']
    : COMMISSION_DRAFT_KEYS
  if (!hasOnlyKeys(value, allowedKeys)) return false
  const audience = value.audience
  const scope = value.scope
  if (!isRecord(audience) || !isRecord(scope)) return false
  if (!hasOnlyKeys(audience, ['primary_reader', 'tags'])) return false
  if (!hasOnlyKeys(scope, ['mode', 'references'])) return false
  const references = scope.references
  const requirements = value.requirements
  const modules = value.topic_module_ids
  const tags = audience.tags
  const formId = value.form_id
  if (!isStringArray(modules) || !isStringArray(tags) || !isNonEmptyString(formId)) {
    return false
  }
  const validReferences =
    Array.isArray(references) &&
    references.every(
      reference =>
        isRecord(reference) &&
        hasOnlyKeys(reference, ['name', 'role']) &&
        isNonEmptyString(reference.name) &&
        (reference.role === 'primary_subject' ||
          reference.role === 'context_only' ||
          reference.role === 'comparator'),
    )
  if (!validReferences || references.length === 0) return false
  const primaryReferences = references.filter(reference => reference.role === 'primary_subject')
  const comparatorCount = references.filter(reference => reference.role === 'comparator').length
  const validRequirements =
    Array.isArray(requirements) &&
    requirements.length > 0 &&
    requirements.every(
      requirement =>
        isRecord(requirement) &&
        hasOnlyKeys(requirement, ['requirement_id', 'question']) &&
        isNonEmptyString(requirement.requirement_id) &&
        isNonEmptyString(requirement.question),
    )
  if (!validRequirements) return false
  return (
    value.schema_version === 3 &&
    isNonEmptyString(value.original_title) &&
    isNonEmptyString(value.location) &&
    isNonEmptyString(value.approved_direction) &&
    ARTICLE_FORM_IDS.has(formId) &&
    modules.length <= 4 &&
    hasUniqueValues(modules) &&
    modules.every(moduleId => TOPIC_MODULE_IDS.has(moduleId)) &&
    isNonEmptyString(audience.primary_reader) &&
    hasUniqueValues(tags) &&
    tags.every(tagId => AUDIENCE_TAG_IDS.has(tagId)) &&
    isNonEmptyString(value.core_reader_question) &&
    isNonEmptyString(value.reader_outcome) &&
    isNonEmptyString(value.primary_subject) &&
    (scope.mode === 'single_subject' ||
      scope.mode === 'head_to_head' ||
      scope.mode === 'ranked_set') &&
    primaryReferences.length === 1 &&
    primaryReferences[0].name.trim().toLocaleLowerCase() ===
      value.primary_subject.trim().toLocaleLowerCase() &&
    hasUniqueValues(references.map(reference => reference.name)) &&
    (scope.mode !== 'single_subject' || comparatorCount === 0) &&
    (scope.mode !== 'head_to_head' || comparatorCount >= 1) &&
    (scope.mode !== 'ranked_set' || comparatorCount >= 2) &&
    (formId !== 'comparison' || scope.mode !== 'single_subject') &&
    (scope.mode !== 'head_to_head' || formId === 'comparison') &&
    hasUniqueValues(requirements.map(requirement => requirement.requirement_id)) &&
    isStringArray(value.exclusions) &&
    (value.call_to_action === null || typeof value.call_to_action === 'string')
  )
}

function isApprovedCommission(value: unknown): value is Prompt2BlogCommission {
  if (!isRecord(value)) return false
  const fingerprint = value.commission_fingerprint
  return (
    typeof fingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(fingerprint) &&
    isCommissionDraft(value, true) &&
    fingerprintCommissionSync(value) === fingerprint
  )
}

function isDirectionOption(value: unknown): value is Prompt2BlogDirectionOption {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, DIRECTION_OPTION_KEYS)) return false
  const { option_id: optionId, direction, rationale, ...commissionFields } = value
  return (
    PROMPT2BLOG_DIRECTION_OPTION_IDS.includes(optionId as Prompt2BlogDirectionOptionId) &&
    isNonEmptyString(rationale) &&
    isCommissionDraft({
      ...commissionFields,
      schema_version: 3,
      original_title: 'Stored direction',
      location: 'Stored location',
      approved_direction: direction,
      call_to_action: null,
    })
  )
}

function normalizeApproval(value: unknown): P2BCommissionApproval | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.status === 'not_started' ||
    candidate.status === 'awaiting_selection' ||
    candidate.status === 'needs_approval'
  ) {
    return { status: candidate.status }
  }
  if (
    candidate.status === 'reconfirmation_required' &&
    (candidate.reason === 'legacy_draft' ||
      candidate.reason === 'commission_edited' ||
      candidate.reason === 'title_or_location_changed')
  ) {
    return { status: candidate.status, reason: candidate.reason }
  }
  if (candidate.status === 'approved') {
    const commission = candidate.commission
    if (isApprovedCommission(commission)) {
      return {
        status: 'approved',
        commission,
      }
    }
  }
  return null
}

/**
 * Stored evidence is re-validated against the approved commission on every
 * load. A draft that no longer matches loses its research instead of carrying
 * unverified sources into a run.
 */
function normalizeEvidencePackage(
  value: unknown,
  approval: P2BCommissionApproval,
): P2BEditorialComposerState['evidencePackage'] {
  if (value == null || approval.status !== 'approved') return null
  const { evidencePackage } = validateEvidencePackageValue(value, approval.commission)
  return retainedEvidencePackage(evidencePackage, approval)
}

function normalizeEditorialState(value: unknown): P2BEditorialComposerState {
  if (!value || typeof value !== 'object') return { ...DEFAULT_EDITORIAL_STATE }
  const candidate = value as Partial<P2BEditorialComposerState>
  const approval = normalizeApproval(candidate.approval)
  if (!approval) return { ...DEFAULT_EDITORIAL_STATE }
  const directionOptions = candidate.directionOptions
  const selectedOptionId =
    typeof candidate.selectedOptionId === 'string' ? candidate.selectedOptionId : null
  const commissionDraft = candidate.commissionDraft
  if (
    !Array.isArray(directionOptions) ||
    !directionOptions.every(isDirectionOption) ||
    (directionOptions.length !== 0 && directionOptions.length !== 3) ||
    (directionOptions.length === 3 &&
      directionOptions.some(
        (option, index) => option.option_id !== PROMPT2BLOG_DIRECTION_OPTION_IDS[index],
      )) ||
    (selectedOptionId !== null &&
      !PROMPT2BLOG_DIRECTION_OPTION_IDS.includes(
        selectedOptionId as Prompt2BlogDirectionOptionId,
      )) ||
    (selectedOptionId !== null &&
      !directionOptions.some(option => option.option_id === selectedOptionId)) ||
    (commissionDraft !== null && !isCommissionDraft(commissionDraft)) ||
    (commissionDraft !== null && selectedOptionId === null) ||
    (approval.status === 'approved' &&
      (commissionDraft === null || !commissionMatchesDraft(commissionDraft, approval.commission)))
  ) {
    return { ...DEFAULT_EDITORIAL_STATE }
  }
  return {
    directionOptions,
    selectedOptionId,
    commissionDraft,
    approval,
    evidencePackage: normalizeEvidencePackage(candidate.evidencePackage, approval),
  }
}

export function saveComposerState(state: P2BFormState): void {
  try {
    const raw = localStorage.getItem(COMPOSER_STORAGE_KEY)
    const stored = raw ? (JSON.parse(raw) as { composerStorageVersion?: unknown }) : null
    if (
      typeof stored?.composerStorageVersion === 'number' &&
      stored.composerStorageVersion > COMPOSER_STORAGE_VERSION
    )
      return
  } catch {
    // A malformed draft is safe to replace with the current validated shape.
  }
  localStorage.setItem(
    COMPOSER_STORAGE_KEY,
    JSON.stringify({
      ...state,
      composerStorageVersion: COMPOSER_STORAGE_VERSION,
    }),
  )
}

export function loadSavedComposerState(): P2BFormState {
  try {
    const raw = localStorage.getItem(COMPOSER_STORAGE_KEY)
    if (!raw) return DEFAULT_COMPOSER_STATE
    const parsed = JSON.parse(raw) as Partial<P2BFormState> & {
      audienceProfile?: unknown
      composerStorageVersion?: unknown
      promptEnhance?: unknown
    }
    const savedStorageVersion =
      typeof parsed.composerStorageVersion === 'number' ? parsed.composerStorageVersion : null
    if (savedStorageVersion !== null && savedStorageVersion > COMPOSER_STORAGE_VERSION) {
      return DEFAULT_COMPOSER_STATE
    }
    const isUnversionedDraft = savedStorageVersion == null
    const isLegacyStorageDraft = savedStorageVersion == null || savedStorageVersion < 3
    // Fold removed audience detail into the remaining reader field before
    // stripping legacy keys, so old drafts keep user-authored guidance.
    const legacyAudienceProfile =
      typeof parsed.audienceProfile === 'string' ? parsed.audienceProfile.trim() : ''
    const savedTargetReader =
      typeof parsed.targetReader === 'string' ? parsed.targetReader.trim() : ''
    if (legacyAudienceProfile && !savedTargetReader) {
      parsed.targetReader = legacyAudienceProfile
    } else if (
      legacyAudienceProfile &&
      savedTargetReader.toLocaleLowerCase() !== legacyAudienceProfile.toLocaleLowerCase()
    ) {
      parsed.targetReader = `${savedTargetReader} — ${legacyAudienceProfile}`
    }
    delete parsed.audienceProfile
    delete parsed.composerStorageVersion
    delete parsed.promptEnhance
    if (isUnversionedDraft) {
      // Earlier drafts stored `true` as the default, not as explicit consent.
      parsed.enableEditorialAugmentation = false
    }
    const modelStack = resolvePrompt2BlogModelStack(parsed.modelStackId)
    const editorial = isLegacyStorageDraft
      ? {
          ...DEFAULT_EDITORIAL_STATE,
          approval: hasMeaningfulLegacyEditorialState(parsed)
            ? ({
                status: 'reconfirmation_required',
                reason: 'legacy_draft',
              } as const)
            : ({ status: 'not_started' } as const),
        }
      : normalizeEditorialState(parsed.editorial)
    return {
      ...DEFAULT_COMPOSER_STATE,
      ...parsed,
      activeWorkflow: parsed.activeWorkflow === 'editorial_v3' ? 'editorial_v3' : 'legacy_v2',
      editorial,
      modelStackId: modelStack.id,
      modelName: resolvePrompt2BlogModelName(modelStack.modelName),
      writingModel: resolvePrompt2BlogWriterModel(modelStack.writingModel),
      auditModel: resolvePrompt2BlogWriterModel(modelStack.auditModel),
      blobs:
        Array.isArray(parsed.blobs) && parsed.blobs.length
          ? parsed.blobs
          : DEFAULT_COMPOSER_STATE.blobs,
      creativityLevel:
        parsed.creativityLevel === 'low' || parsed.creativityLevel === 'high'
          ? parsed.creativityLevel
          : 'medium',
    }
  } catch {
    return DEFAULT_COMPOSER_STATE
  }
}
