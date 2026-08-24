import {
  DEFAULT_PROMPT2BLOG_MODEL_STACK_ID,
  resolvePrompt2BlogModelStack,
  resolvePrompt2BlogModelName,
  resolvePrompt2BlogWriterModel,
} from '../constants/prompt2blog.constants'
import type { P2BFormState } from './composer.types'

export const COMPOSER_STORAGE_KEY = 'p2b-form-draft'
const COMPOSER_STORAGE_VERSION = 2
const DEFAULT_MODEL_STACK = resolvePrompt2BlogModelStack(DEFAULT_PROMPT2BLOG_MODEL_STACK_ID)

export const DEFAULT_COMPOSER_STATE: P2BFormState = {
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

export function saveComposerState(state: P2BFormState): void {
  localStorage.setItem(COMPOSER_STORAGE_KEY, JSON.stringify({
    ...state,
    composerStorageVersion: COMPOSER_STORAGE_VERSION,
  }))
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
    const isUnversionedDraft = parsed.composerStorageVersion == null
    // Fold removed audience detail into the remaining reader field before
    // stripping legacy keys, so old drafts keep user-authored guidance.
    const legacyAudienceProfile = typeof parsed.audienceProfile === 'string'
      ? parsed.audienceProfile.trim()
      : ''
    const savedTargetReader = typeof parsed.targetReader === 'string'
      ? parsed.targetReader.trim()
      : ''
    if (legacyAudienceProfile && !savedTargetReader) {
      parsed.targetReader = legacyAudienceProfile
    } else if (
      legacyAudienceProfile
      && savedTargetReader.toLocaleLowerCase() !== legacyAudienceProfile.toLocaleLowerCase()
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
    return {
      ...DEFAULT_COMPOSER_STATE,
      ...parsed,
      modelStackId: modelStack.id,
      modelName: resolvePrompt2BlogModelName(modelStack.modelName),
      writingModel: resolvePrompt2BlogWriterModel(modelStack.writingModel),
      auditModel: resolvePrompt2BlogWriterModel(modelStack.auditModel),
      blobs: Array.isArray(parsed.blobs) && parsed.blobs.length
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
