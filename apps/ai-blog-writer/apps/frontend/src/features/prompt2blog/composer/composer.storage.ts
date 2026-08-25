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

export const COMPOSER_STORAGE_KEY = 'p2b-form-draft'
export const COMPOSER_STORAGE_VERSION = 3
const DEFAULT_MODEL_STACK = resolvePrompt2BlogModelStack(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)

export const DEFAULT_EDITORIAL_STATE: P2BEditorialComposerState = {
  directionOptions: [],
  selectedOptionId: null,
  commissionDraft: null,
  approval: { status: 'not_started' },
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isCommissionDraft(value: unknown): value is Prompt2BlogCommissionDraft {
  if (!isRecord(value)) return false
  const audience = value.audience
  const scope = value.scope
  if (!isRecord(audience) || !isRecord(scope)) return false
  const references = scope.references
  const requirements = value.requirements
  return (
    value.schema_version === 3 &&
    isNonEmptyString(value.original_title) &&
    isNonEmptyString(value.location) &&
    isNonEmptyString(value.approved_direction) &&
    isNonEmptyString(value.form_id) &&
    isStringArray(value.topic_module_ids) &&
    isNonEmptyString(audience.primary_reader) &&
    isStringArray(audience.tags) &&
    (scope.mode === 'single_subject' ||
      scope.mode === 'head_to_head' ||
      scope.mode === 'ranked_set') &&
    Array.isArray(references) &&
    references.length > 0 &&
    references.every(
      reference =>
        isRecord(reference) &&
        isNonEmptyString(reference.name) &&
        (reference.role === 'primary_subject' ||
          reference.role === 'context_only' ||
          reference.role === 'comparator'),
    ) &&
    Array.isArray(requirements) &&
    requirements.length > 0 &&
    requirements.every(
      requirement =>
        isRecord(requirement) &&
        isNonEmptyString(requirement.requirement_id) &&
        isNonEmptyString(requirement.question),
    ) &&
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
    isCommissionDraft(value)
  )
}

function isDirectionOption(value: unknown): value is Prompt2BlogDirectionOption {
  if (!isRecord(value)) return false
  return (
    PROMPT2BLOG_DIRECTION_OPTION_IDS.includes(value.option_id as Prompt2BlogDirectionOptionId) &&
    isNonEmptyString(value.direction) &&
    isNonEmptyString(value.form_id) &&
    isStringArray(value.topic_module_ids) &&
    isRecord(value.audience) &&
    isNonEmptyString(value.audience.primary_reader) &&
    isStringArray(value.audience.tags) &&
    isNonEmptyString(value.core_reader_question) &&
    isNonEmptyString(value.reader_outcome) &&
    isNonEmptyString(value.primary_subject) &&
    isRecord(value.scope) &&
    (value.scope.mode === 'single_subject' ||
      value.scope.mode === 'head_to_head' ||
      value.scope.mode === 'ranked_set') &&
    Array.isArray(value.scope.references) &&
    value.scope.references.length > 0 &&
    value.scope.references.every(
      reference =>
        isRecord(reference) &&
        isNonEmptyString(reference.name) &&
        (reference.role === 'primary_subject' ||
          reference.role === 'context_only' ||
          reference.role === 'comparator'),
    ) &&
    Array.isArray(value.requirements) &&
    value.requirements.length > 0 &&
    value.requirements.every(
      requirement =>
        isRecord(requirement) &&
        isNonEmptyString(requirement.requirement_id) &&
        isNonEmptyString(requirement.question),
    ) &&
    isStringArray(value.exclusions) &&
    isNonEmptyString(value.rationale)
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
    (selectedOptionId !== null &&
      !PROMPT2BLOG_DIRECTION_OPTION_IDS.includes(
        selectedOptionId as Prompt2BlogDirectionOptionId,
      )) ||
    (selectedOptionId !== null &&
      !directionOptions.some(option => option.option_id === selectedOptionId)) ||
    (commissionDraft !== null && !isCommissionDraft(commissionDraft)) ||
    (commissionDraft !== null && selectedOptionId === null) ||
    (approval.status === 'approved' &&
      (commissionDraft === null ||
        approval.commission.original_title !== commissionDraft.original_title ||
        approval.commission.location !== commissionDraft.location))
  ) {
    return { ...DEFAULT_EDITORIAL_STATE }
  }
  return {
    directionOptions,
    selectedOptionId,
    commissionDraft,
    approval,
  }
}

export function saveComposerState(state: P2BFormState): void {
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
