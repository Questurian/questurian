import {
  DEFAULT_PROMPT2BLOG_MODEL,
  DEFAULT_PROMPT2BLOG_WRITER_MODEL,
  resolvePrompt2BlogModelName,
  resolvePrompt2BlogWriterModel,
} from '../constants/prompt2blog.constants'
import type { P2BFormState } from './composer.types'

export const COMPOSER_STORAGE_KEY = 'p2b-form-draft'

export const DEFAULT_COMPOSER_STATE: P2BFormState = {
  articleTypeId: null,
  articleGoal: '',
  targetReader: '',
  destinationContext: '',
  angle: '',
  callToAction: '',
  modelName: DEFAULT_PROMPT2BLOG_MODEL,
  writingModel: DEFAULT_PROMPT2BLOG_WRITER_MODEL,
  toneId: '',
  lengthId: '',
  brandVoiceId: '',
  primaryKeyword: '',
  secondaryKeywords: '',
  mustInclude: '',
  audienceProfile: '',
  creativityLevel: 'medium',
  negativeInstructions: '',
  promptEnhance: true,
  enableEditorialAugmentation: true,
  blobs: [{ id: 1, content: '' }],
}

export function loadSavedComposerState(): P2BFormState {
  try {
    const raw = localStorage.getItem(COMPOSER_STORAGE_KEY)
    if (!raw) return DEFAULT_COMPOSER_STATE
    const parsed = JSON.parse(raw) as Partial<P2BFormState>
    return {
      ...DEFAULT_COMPOSER_STATE,
      ...parsed,
      modelName: resolvePrompt2BlogModelName(parsed.modelName),
      writingModel: resolvePrompt2BlogWriterModel(parsed.writingModel),
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
